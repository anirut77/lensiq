"use strict";
// tests/unit/case.test.js — lensiq-case.js (LQCase): SHA-256 vs node:crypto, canonical JSON, the append-only hash chain
// (tamper / delete / insert / re-order detection), replay of tags / notes / status, validation (reviewer name, closed
// case, retract / amend never rewrite), CSV (formula-injection safe) + JSON round trip, the localStorage store (prefix-only
// writes, deletion ledger), time parsing; plus static checks of case-review.html / case-review.js: the "does not judge
// truthfulness" banner, no AI / camera / network APIs, no emotion / deception vocabulary, dictionaries complete.
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const C = require("../../lensiq-case.js");

const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const T0 = Date.parse("2026-11-08T03:00:00Z");

function sample() {
  let log = C.act([], "Somchai", "case.create", { title: "Warehouse door 3 Nov", ref: "HR-2026-014", id: "c-test" }, { at: T0 });
  log = C.act(log, "Somchai", "clip.add", { clip: { id: "v-1", name: "door.mp4", size: 1234, type: "video/mp4", sha256: "a".repeat(64), dur: 61.27 } }, { at: T0 + 1000 });
  log = C.act(log, "Somying", "tag.add", { id: "t-1", clipId: "v-1", t: 12.34, kind: "event", text: "box carried out" }, { at: T0 + 2000 });
  log = C.act(log, "Somying", "note.add", { id: "n-1", text: "second camera needed" }, { at: T0 + 3000 });
  return log;
}

test("sha256Hex matches node:crypto (empty, block edges, UTF-8 Thai / Chinese, long input, bytes)", () => {
  const inputs = ["", "abc", "a".repeat(55), "a".repeat(56), "a".repeat(63), "a".repeat(64), "a".repeat(65), "ทบทวนเคส 中文 ✓", "x".repeat(10000)];
  for (const s of inputs) assert.equal(C.sha256Hex(s), crypto.createHash("sha256").update(s, "utf8").digest("hex"), "len " + s.length);
  const bytes = crypto.randomBytes(777);
  assert.equal(C.sha256Hex(new Uint8Array(bytes)), crypto.createHash("sha256").update(bytes).digest("hex"));
  assert.equal(C.sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"); // FIPS 180-2 vector
});

test("canon: sorted keys, undefined dropped, stable across key order", () => {
  assert.equal(C.canon({ b: 1, a: [1, { d: undefined, c: "x" }], e: null }), '{"a":[1,{"c":"x"}],"b":1,"e":null}');
  assert.equal(C.canon({ x: 1, y: 2 }), C.canon({ y: 2, x: 1 }));
});

test("chain: every entry links to the previous hash; verify ok; head = last hash", () => {
  const log = sample();
  assert.equal(log[0].prev, C.GENESIS);
  for (let i = 1; i < log.length; i++) assert.equal(log[i].prev, log[i - 1].hash);
  const v = C.verify(log);
  assert.equal(v.ok, true); assert.equal(v.n, 4); assert.equal(v.head, log[3].hash);
  assert.equal(log[1].at, "2026-11-08T03:00:01.000Z");
  assert.equal(log[2].who, "Somying");
});

test("verify catches an edited field, a deleted entry, an inserted entry, a re-ordered log and a forged re-hash", () => {
  const base = sample();
  const clone = () => JSON.parse(JSON.stringify(base));
  let l = clone(); l[2].data.text = "nothing happened"; assert.deepEqual([C.verify(l).ok, C.verify(l).brokenAt, C.verify(l).reason], [false, 2, "hash"]);
  l = clone(); l[2].who = "Someone else"; assert.equal(C.verify(l).brokenAt, 2);
  l = clone(); l[1].at = "2026-11-09T00:00:00.000Z"; assert.equal(C.verify(l).brokenAt, 1);
  l = clone(); l.splice(1, 1); assert.equal(C.verify(l).ok, false); assert.equal(C.verify(l).brokenAt, 1);
  l = clone(); l.splice(2, 0, Object.assign({}, l[2])); assert.equal(C.verify(l).ok, false);
  l = clone(); [l[1], l[2]] = [l[2], l[1]]; assert.equal(C.verify(l).ok, false);
  // re-hashing an edited entry still breaks the NEXT link
  l = clone(); l[1].data.clip.name = "other.mp4"; l[1].hash = C.sha256Hex(C.canon({ seq: 1, at: l[1].at, who: l[1].who, act: l[1].act, data: l[1].data, prev: l[1].prev }));
  assert.equal(C.verify(l).brokenAt, 2); assert.equal(C.verify(l).reason, "prev");
  // truncating the tail is only detectable against a recorded head hash (printed summary / export) — documented
  l = clone().slice(0, 3); assert.equal(C.verify(l).ok, true); assert.notEqual(C.verify(l).head, C.verify(base).head);
  assert.equal(C.verify("x").ok, false);
});

test("verify warns (not fails) when the device clock moves back", () => {
  let log = C.act([], "A", "case.create", { title: "t" }, { at: T0 });
  log = C.act(log, "A", "note.add", { text: "n" }, { at: T0 - 60000 });
  const v = C.verify(log);
  assert.equal(v.ok, true); assert.deepEqual(v.warnings, [{ seq: 1, code: "clock-back" }]);
});

test("replay: clips, tags (rounded), notes, reviewers, status", () => {
  const s = C.replay(sample());
  assert.equal(s.id, "c-test"); assert.equal(s.title, "Warehouse door 3 Nov"); assert.equal(s.ref, "HR-2026-014"); assert.equal(s.status, "open");
  assert.equal(s.clips.length, 1); assert.equal(s.clips[0].dur, 61.3); assert.equal(s.clips[0].addedBy, "Somchai");
  assert.deepEqual(s.tags.map(t => [t.t, t.kind, t.by]), [[12.3, "event", "Somying"]]);
  assert.deepEqual(s.reviewers, ["Somchai", "Somying"]);
  assert.equal(s.createdBy, "Somchai");
});

test("act: reviewer name required; first entry must create; unknown clip / tag rejected; bad kind -> other", () => {
  assert.throws(() => C.act([], "  ", "case.create", { title: "x" }), e => e.code === "no-reviewer");
  assert.throws(() => C.act([], "A", "case.create", { title: "  " }), e => e.code === "empty");
  assert.throws(() => C.act([], "A", "note.add", { text: "x" }), e => e.code === "bad-act");
  const log = sample();
  assert.throws(() => C.act(log, "A", "tag.add", { clipId: "nope", t: 1 }), e => e.code === "no-clip");
  assert.throws(() => C.act(log, "A", "tag.retract", { id: "nope" }), e => e.code === "no-tag");
  assert.throws(() => C.act(log, "A", "frobnicate", {}), e => e.code === "bad-act");
  assert.throws(() => C.act(log, "A", "case.create", { title: "again" }), e => e.code === "bad-act");
  const l2 = C.act(log, "A", "tag.add", { clipId: "v-1", t: 5, kind: "liar" });
  assert.equal(C.replay(l2).tags.find(t => t.t === 5).kind, "other");
  assert.equal(log.length, 4, "input log not mutated");
});

test("corrections never rewrite: retract keeps the tag, amend keeps the original note", () => {
  let log = sample();
  log = C.act(log, "Somchai", "tag.retract", { id: "t-1", reason: "wrong clip" });
  log = C.act(log, "Somchai", "note.amend", { id: "n-2", of: "n-1", text: "second camera angle needed (east)" });
  const s = C.replay(log);
  assert.equal(s.tags.length, 1); assert.equal(s.tags[0].retracted.by, "Somchai"); assert.equal(s.tags[0].text, "box carried out");
  assert.equal(s.notes.length, 2); assert.equal(s.notes[0].amendedBy, "n-2"); assert.equal(s.notes[0].text, "second camera needed"); assert.equal(s.notes[1].amends, "n-1");
  assert.throws(() => C.act(log, "A", "tag.retract", { id: "t-1" }), e => e.code === "no-tag");
  assert.throws(() => C.act(log, "A", "note.amend", { of: "n-1", text: "again" }), e => e.code === "no-note");
  assert.equal(C.verify(log).ok, true);
});

test("status: open -> review -> closed blocks edits until reopened; same status rejected; reason kept", () => {
  let log = C.act(sample(), "Lead", "status", { to: "review" });
  assert.throws(() => C.act(log, "Lead", "status", { to: "review" }), e => e.code === "bad-status");
  assert.throws(() => C.act(log, "Lead", "status", { to: "guilty" }), e => e.code === "bad-status");
  log = C.act(log, "Lead", "status", { to: "closed", reason: "reviewed by committee" });
  assert.equal(C.replay(log).status, "closed");
  assert.deepEqual(log[log.length - 1].data, { from: "review", to: "closed", reason: "reviewed by committee" });
  for (const [a, d] of [["tag.add", { clipId: "v-1", t: 1 }], ["note.add", { text: "x" }], ["clip.add", { clip: { name: "b" } }], ["tag.retract", { id: "t-1" }]])
    assert.throws(() => C.act(log, "Lead", a, d), e => e.code === "closed", a);
  log = C.act(log, "Lead", "export", { fmt: "csv" }); // export is allowed on a closed case
  log = C.act(log, "Lead", "status", { to: "open", reason: "new evidence" });
  log = C.act(log, "Lead", "note.add", { text: "reopened" });
  assert.equal(C.replay(log).notes.length, 2); assert.equal(C.replay(log).exports, 1);
});

test("act refuses to append to a broken chain", () => {
  const log = JSON.parse(JSON.stringify(sample())); log[1].data.clip.size = 1;
  assert.throws(() => C.act(log, "A", "note.add", { text: "x" }), e => e.code === "broken");
});

test("input hygiene: control characters stripped, lengths capped, invalid sha dropped", () => {
  let log = C.act([], "A\u0000B", "case.create", { title: "x".repeat(500) });
  assert.equal(log[0].who, "AB"); assert.equal(log[0].data.title.length, C.LIMITS.title);
  log = C.act(log, "A", "clip.add", { clip: { name: "a.mp4", size: -5, sha256: "not-a-hash" } });
  assert.deepEqual([log[1].data.clip.size, log[1].data.clip.sha256], [0, null]);
});

test("CSV: header labels, one row per entry, formula injection neutralised, quotes escaped, BOM", () => {
  let log = sample();
  log = C.act(log, "=HYPERLINK(\"x\")", "note.add", { text: "+cmd, \"quoted\"\nline2" });
  const csv = C.toCSV(log, { act: a => "L:" + a, detail: e => e.act === "note.add" ? e.data.text : "" });
  assert.ok(csv.startsWith("﻿seq,time_utc,reviewer"));
  const lines = csv.trim().split("\r\n");
  assert.equal(lines.length, 1 + log.length);
  assert.match(csv, /"'=HYPERLINK\(""x""\)"/);
  assert.match(csv, /"'\+cmd, ""quoted""\nline2"/);
  assert.match(csv, /L:tag\.add/);
  assert.equal(C.csvCell("-1"), "'-1"); assert.equal(C.csvCell("@x"), "'@x"); assert.equal(C.csvCell("ok"), "ok");
});

test("JSON export round trip re-verifies the chain; a tampered file is refused", () => {
  const log = sample(), out = JSON.parse(JSON.stringify(C.toJSON(log)));
  assert.equal(out.format, C.FORMAT); assert.equal(out.integrity.ok, true); assert.equal(out.integrity.head, log[3].hash);
  assert.equal(out.case.title, "Warehouse door 3 Nov");
  const r = C.fromJSON(out);
  assert.equal(r.ok, true); assert.deepEqual(r.log, log);
  out.log[2].data.text = "edited"; out.integrity.ok = true;
  const bad = C.fromJSON(out);
  assert.equal(bad.ok, false); assert.equal(bad.brokenAt, 2);
  assert.equal(C.fromJSON({ format: "other" }).reason, "format");
  assert.ok(!/data:image|data:video/.test(JSON.stringify(C.toJSON(log))), "video is never part of the export");
});

test("fromJSON refuses a valid chain that carries no usable case id / title (crafted import)", () => {
  for (const data of [null, {}, { id: "", title: "x" }, { id: 5, title: "x" }, { id: "c-1" }, [1]]) {
    const e = C.makeEntry([], { who: "X", act: "case.create", data, at: T0 });
    if (data === null || Array.isArray(data)) e.data = data, e.hash = C.sha256Hex(C.canon({ seq: e.seq, at: e.at, who: e.who, act: e.act, data: e.data, prev: e.prev }));
    const r = C.fromJSON({ format: C.FORMAT, log: [e] });
    assert.equal(r.ok, false, JSON.stringify(data)); assert.equal(r.reason, "format");
  }
});

test("clip.attach: match true / false / null (unverified); tags + notes record the non-original loaded file", () => {
  let log = sample();
  log = C.act(log, "A", "clip.attach", { clipId: "v-1", sha256: "a".repeat(64), match: true });
  log = C.act(log, "A", "clip.attach", { clipId: "v-1", sha256: "b".repeat(64), match: false });
  log = C.act(log, "A", "clip.attach", { clipId: "v-1", sha256: null, match: null });
  assert.deepEqual(C.replay(log).clips[0].attachments.map(a => a.match), [true, false, null]);
  log = C.act(log, "A", "tag.add", { clipId: "v-1", t: 3, kind: "event", loaded: { sha256: "b".repeat(64), match: false } });
  log = C.act(log, "A", "tag.add", { clipId: "v-1", t: 4, kind: "event", loaded: { sha256: "zz", match: null } });
  log = C.act(log, "A", "tag.add", { clipId: "v-1", t: 5, kind: "event", loaded: { sha256: "a".repeat(64), match: true } });
  log = C.act(log, "A", "note.add", { text: "seen", clipId: "v-1", t: 4, loaded: { sha256: "b".repeat(64), match: false } });
  const s = C.replay(log), byT = t => s.tags.find(x => x.t === t);
  assert.deepEqual(byT(3).loaded, { sha256: "b".repeat(64), match: false });
  assert.deepEqual(byT(4).loaded, { sha256: null, match: null });
  assert.equal(byT(5).loaded, null, "the verified original records nothing extra");
  assert.equal(byT(12.3).loaded, null);
  assert.deepEqual(s.notes[1].loaded, { sha256: "b".repeat(64), match: false });
  assert.equal(C.verify(log).ok, true);
});

test("store.note appends device-level events to the hash-chained ledger", () => {
  const st = C.createStore(memLS());
  st.note("Somchai", "settings.retention", { from: 30, to: 7 });
  st.note("LENSIQ (auto)", "clip.purge", { caseId: "c-x", clipId: "v-x", inCaseLog: false });
  const led = st.ledger();
  assert.equal(led.length, 2); assert.equal(led[1].prev, led[0].hash); assert.equal(led[0].prev, C.GENESIS);
  assert.equal(led[0].act, "settings.retention"); assert.deepEqual(led[1].data, { caseId: "c-x", clipId: "v-x", inCaseLog: false });
});

function memLS() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), get length() { return m.size; }, key: i => [...m.keys()][i], _m: m };
}

test("store: append-only put (a shorter or diverging log is refused), list, deletion ledger is hash-chained", () => {
  const ls = memLS(), st = C.createStore(ls), log = sample();
  st.put("c-test", log.slice(0, 2));
  st.put("c-test", log);
  assert.equal(st.get("c-test").length, 4);
  assert.throws(() => st.put("c-test", log.slice(0, 3)), e => e.code === "conflict");
  const fork = C.act(log.slice(0, 3), "X", "note.add", { text: "fork" });
  assert.throws(() => st.put("c-test", fork), e => e.code === "conflict");
  assert.deepEqual(st.list().map(c => c.id), ["c-test"]);
  assert.equal(st.remove("c-test", "Somchai"), true);
  assert.equal(st.get("c-test"), null);
  const led = st.ledger();
  assert.equal(led.length, 1);
  assert.deepEqual(led[0].data, { id: "c-test", entries: 4, head: log[3].hash, intact: true });
  assert.equal(led[0].prev, C.GENESIS); assert.equal(C.verify([Object.assign({}, led[0], { act: "case.create" })]).ok, false, "ledger entries are not case logs");
  assert.ok(!/Warehouse/.test(JSON.stringify(led)), "the ledger keeps no case title or notes");
  st.wipe(); assert.equal(ls._m.size, 0);
});

test("fmtTime / parseTime", () => {
  assert.equal(C.fmtTime(0), "0:00"); assert.equal(C.fmtTime(83), "1:23"); assert.equal(C.fmtTime(83.5), "1:23.5"); assert.equal(C.fmtTime(3723), "1:02:03");
  assert.equal(C.parseTime("83"), 83); assert.equal(C.parseTime("1:23"), 83); assert.equal(C.parseTime("01:23.5"), 83.5); assert.equal(C.parseTime("1:02:03"), 3723);
  assert.equal(C.parseTime("1:75"), null); assert.equal(C.parseTime("abc"), null); assert.equal(C.parseTime(""), null);
});

test("vault reports why it cannot encrypt (no IndexedDB / WebCrypto) instead of storing plain clips", async () => {
  const v = C.createVault(null, null);
  assert.ok(["no-indexeddb", "no-webcrypto", "insecure-context"].includes(v.reason()));
  assert.equal(v.supported(), false);
  await assert.rejects(() => v.put("c", "v", { size: 1, type: "video/mp4", arrayBuffer: async () => new ArrayBuffer(1) }), e => e.code === "insecure");
  assert.equal(await v.get("c", "v"), null);
});

// ---- static checks of the page ------------------------------------------------------------------------------------
const HTML = read("case-review.html"), JS = read("case-review.js"), LIB = read("lensiq-case.js");
const code = s => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'])\/\/.*$/gm, "$1");

test("page: 'does not judge truthfulness' banner, human-decides wording, no camera / AI / network", () => {
  assert.match(HTML, /data-i18n="cr\.banner\.h">เครื่องมือนี้ไม่ตัดสินว่าใครพูดจริงหรือโกหก/);
  assert.match(HTML, /ผู้ตรวจเป็นผู้ดู บันทึก และตัดสินใจเองทั้งหมด/);
  assert.match(HTML, /role="note" id="banner"/);
  for (const src of [code(JS), code(LIB)]) {
    for (const api of [/getUserMedia/, /\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /WebSocket/, /\bfaceapi\b/, /LQDetect/, /\bort\./, /\btf\./, /SpeechRecognition/, /AudioContext/])
      assert.doesNotMatch(src, api, String(api));
  }
  for (const s of ["vendor/face-api", "lensiq-detect", "ort.wasm", "lensiq-camera"]) assert.ok(!HTML.includes(s), s);
  assert.match(HTML, /<input id="clipFile" type="file" accept="video\/\*"/);
});

test("no emotion inference / lie-deception vocabulary in tag types, actions or statuses", () => {
  const BAD = /lie|liar|decept|truth|honest|credib|emotion|stress|nervous|suspici|guilt|โกหก|อารมณ์|ความจริง|น่าสงสัย|เครียด|ประหม่า|ผิดจริง/i;
  for (const k of C.TAG_KINDS) { assert.doesNotMatch(k.id, BAD); assert.doesNotMatch(k.th, BAD); }
  for (const a of C.ACTS.concat(C.STATUS)) assert.doesNotMatch(a, BAD);
  const w = {}; w.window = w;
  for (const lang of ["en", "zh"]) {
    vm.runInNewContext(read(`i18n/${lang}-case.js`), w);
    const d = w.LQI18N_Q[w.LQI18N_Q.length - 1][lang];
    for (const [k, v] of Object.entries(d)) if (/^cr\.(kind|act|st)\./.test(k)) assert.doesNotMatch(v, /lie|decept|truth|emotion|stress|nervous|suspici|guilt|谎|情绪|可疑/i, k);
  }
});

test("dictionaries: every cr.* key the page uses exists in en and zh with the same {placeholders}", () => {
  const thai = {};
  for (const m of HTML.matchAll(/data-i18n="(cr\.[^"]+)"/g)) thai[m[1]] = "";
  for (const m of HTML.matchAll(/data-i18n-attr="([^"]+)"/g)) for (const p of m[1].split(";")) thai[p.split(":")[1]] = "";
  for (const m of JS.matchAll(/T\("(cr\.[^"]+)", "((?:[^"\\]|\\.)*)"/g)) thai[m[1]] = JSON.parse('"' + m[2] + '"');
  const w = {}; w.window = w;
  for (const lang of ["en", "zh"]) {
    w.LQI18N_Q = [];
    vm.runInNewContext(read(`i18n/${lang}-case.js`), w);
    const d = w.LQI18N_Q[0][lang];
    for (const [k, th] of Object.entries(thai)) {
      assert.ok(typeof d[k] === "string" && d[k], `${lang} ${k}`);
      assert.doesNotMatch(d[k], /[ก-๛]/, `${lang} ${k} has Thai`);
      const ph = s => (s.match(/\{\w+\}/g) || []).sort().join();
      if (th) assert.equal(ph(d[k]), ph(th), `${lang} ${k} placeholders`);
    }
  }
});

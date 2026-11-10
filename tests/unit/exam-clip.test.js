"use strict";
// tests/unit/exam-clip.test.js — LENSIQ Exam evidence clip (lensiq-exam-clip.js + the clip parts of lensiq-exam.js):
// default OFF, objective flags only, ring segments (video track only), pending slots that are dropped unless kept,
// encrypted store through LQVault (no plaintext at rest, crypto-shred on delete, auto-delete after N days, insecure =
// nothing stored), message allowlist for clip / keep, board keep action named, CSV column; and the guard that no exam
// file uses an emotion / expression / age-gender API and every flag is an objective event.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const C = require("../../lensiq-exam-clip.js");
const E = require("../../lensiq-exam.js");
const V = require("../../lensiq-facevault.js");

const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");

function memKeys() {
  const m = new Map();
  return {
    get: async id => m.get(id) || null, add: async (id, k) => { if (m.has(id)) throw new Error("ConstraintError"); m.set(id, k); },
    del: async id => { m.delete(id); }, clear: async () => m.clear(), m
  };
}
function memDb() {
  const m = new Map();
  return { put: async r => { m.set(r.id, JSON.parse(JSON.stringify(r))); }, get: async id => m.get(id) || null, all: async () => [...m.values()], del: async id => { m.delete(id); }, m };
}
const blob = (txt, type = "video/webm") => new Blob([txt], { type });
const clip = (t0 = 1000) => ({
  mime: "video/webm", from: t0, to: t0 + 10000, ms: 10000,
  segs: [{ blob: blob("SEG-ONE-secret-pixels"), t0, t1: t0 + 5000 }, { blob: blob("SEG-TWO-secret-pixels"), t0: t0 + 5000, t1: t0 + 10000 }]
});

test("config: OFF by default; auto-keep only with clips on; retention from the allowlist; exam link params", () => {
  assert.deepEqual(C.cleanCfg(undefined), { on: false, auto: false, days: 14 });
  assert.deepEqual(C.cleanCfg({ on: "yes", auto: true, days: 9999 }), { on: false, auto: false, days: 14 }, "only a real true turns it on");
  assert.deepEqual(C.cleanCfg({ on: false, auto: true }), { on: false, auto: false, days: 14 }, "auto-keep needs clips on");
  assert.deepEqual(C.cleanCfg({ on: true, auto: true, days: 7 }), { on: true, auto: true, days: 7 });
  const p = new URLSearchParams("clip=1&clipdays=30");
  assert.deepEqual(C.cfgFromParams(p, null), { on: true, auto: false, days: 30 });
  assert.deepEqual(C.cfgFromParams(new URLSearchParams(""), null), C.cleanCfg(null));
  assert.deepEqual(C.cfgFromParams(new URLSearchParams("clip=1&clipauto=1&clipdays=3"), null), { on: true, auto: true, days: 14 });
});

test("clips only for Watch / Check of objective signals; never info, setup or room events", () => {
  assert.ok(C.wantsClip({ sig: "phone", lvl: "check" }));
  assert.ok(C.wantsClip({ sig: "multiface", lvl: "check" }));
  assert.ok(C.wantsClip({ sig: "extra", lvl: "watch" }));
  assert.ok(!C.wantsClip({ sig: "phone", lvl: "info" }));
  assert.ok(!C.wantsClip({ sig: "setup", lvl: "setup" }));
  assert.ok(!C.wantsClip({ sig: "mouth", lvl: "info" }));
  assert.ok(!C.wantsClip({ sig: "roommute", lvl: "watch" }));
  for (const s of C.CLIP_SIGS) assert.ok(E.SIGNALS[s], "clip signal exists: " + s);
});

test("ring: newest segments covering 10 s; video track only; snapshot closes the running segment", async () => {
  const p = C.pickSegs([{ t0: 0, t1: 5000 }, { t0: 5000, t1: 10000 }, { t0: 10000, t1: 15000 }, { t0: 15000, t1: 17000 }], 17000, 10000);
  assert.deepEqual(p.segs.map(s => s.t0), [5000, 10000, 15000]); assert.equal(p.ms, 12000); assert.equal(p.from, 5000);
  assert.equal(C.pickSegs([], 5, 10000).segs.length, 0);

  let t = 0; const recs = [];
  class FakeMR {
    static isTypeSupported(m) { return m === "video/webm"; }
    constructor(stream, opt) { this.stream = stream; this.opt = opt; this.state = "inactive"; recs.push(this); }
    start() { this.state = "recording"; }
    stop() { this.state = "inactive"; this.ondataavailable({ data: blob("frames" + recs.indexOf(this)) }); this.onstop(); }
  }
  class FakeMS { constructor(tracks) { this.tracks = tracks; } }
  const stream = { getVideoTracks: () => [{ kind: "video" }], getAudioTracks: () => [{ kind: "audio" }] };
  const ring = C.createRing(stream, { segMs: 1e9, MR: FakeMR, MS: FakeMS, now: () => t });
  assert.ok(ring && ring.running); assert.equal(ring.mime, "video/webm");
  assert.deepEqual(recs[0].stream.tracks.map(x => x.kind), ["video"], "audio is never recorded");
  t = 4000; const a = await ring.snapshot();
  assert.equal(a.segs.length, 1); assert.equal(a.ms, 4000);
  t = 9000; await ring.snapshot(); t = 15000;
  const b = await ring.snapshot();
  assert.ok(b.ms >= 10000 && b.segs.length === 2, JSON.stringify({ ms: b.ms, n: b.segs.length }));
  ring.stop(); assert.equal(ring.running, false); assert.equal(await ring.snapshot(), null);
  assert.equal(C.createRing({ getVideoTracks: () => [] }, { MR: FakeMR, MS: FakeMS }), null, "no video track -> no ring");
  assert.equal(C.createRing(stream, { MR: undefined, MS: FakeMS }), null);
});

test("ring: a '10 s' clip stays ~10 s (2 s segments, no 15 s overshoot) and quick repeated flags do not shrink it", async () => {
  // 2 s segments + a partial newest segment of x ms: never more than 11.5 s, never less than 9.5 s once 10 s exist
  for (const x of [100, 900, 1500, 1600, 1999]) {
    const segs = []; for (let t = 0; t < 20000; t += 2000) segs.push({ t0: t, t1: t + 2000 });
    segs.push({ t0: 20000, t1: 20000 + x });
    const p = C.pickSegs(segs, 20000 + x, 10000);
    assert.ok(p.ms >= 9500 && p.ms <= 11500, x + " -> " + p.ms);
  }
  // many flags in quick succession: every snapshot closes a short segment; the clip still covers ~10 s (time-based trim)
  let t = 0;
  class FakeMR {
    static isTypeSupported(m) { return m === "video/webm"; }
    constructor() { this.state = "inactive"; }
    start() { this.state = "recording"; }
    stop() { this.state = "inactive"; this.ondataavailable({ data: blob("f") }); this.onstop(); }
  }
  class FakeMS { constructor(tracks) { this.tracks = tracks; } }
  const ring = C.createRing({ getVideoTracks: () => [{ kind: "video" }] }, { segMs: 1e9, MR: FakeMR, MS: FakeMS, now: () => t });
  let last = null;
  for (t = 500; t <= 14000; t += 500) last = await ring.snapshot();
  assert.ok(last.ms >= 9500 && last.ms <= 11500 && last.segs.length > 6, JSON.stringify({ ms: last.ms, n: last.segs.length }));
  ring.stop();
});

test("pending: kept only in memory, bounded, dropped after the hold time", () => {
  const pd = C.createPending({ max: 2, holdMs: 1000 });
  assert.deepEqual(pd.add("a", { x: 1 }, 0), []);
  pd.add("b", {}, 10);
  assert.deepEqual(pd.add("c", {}, 20), ["a"], "oldest dropped when full");
  assert.deepEqual(pd.expire(1015), ["b"]);
  assert.ok(pd.take("c")); assert.equal(pd.take("c"), null); assert.equal(pd.size, 0);
});

test("store: encrypted at rest with LQVault, round trip, crypto-shred on delete, auto-delete after N days", async () => {
  V._reset(); const keys = memKeys(); V._setKeyStore(keys);
  const db = memDb(); let now = 1e12;
  const st = C.createStore({ vault: V, db, now: () => now });
  assert.ok(st.supported());
  const meta = await st.save({ id: "node00000001-e1-ab", room: "R1", node: "node00000001", seat: "12", sig: "phone", lvl: "check", t: now, how: "kept" }, clip(), 7);
  assert.equal(meta.exp - meta.kept, 7 * C.DAY);
  const rec = db.m.get("node00000001-e1-ab");
  const env = JSON.parse(rec.env);
  assert.equal(env.enc, "lq1", "LQVault envelope");
  const raw = JSON.stringify(rec);
  assert.ok(!/SEG-ONE|secret-pixels/.test(raw) && !/U0VHLU9ORS/.test(raw), "no plaintext (nor base64 of it) at rest");
  assert.ok(!("segs" in rec) && !("blob" in rec));
  const back = await st.load("node00000001-e1-ab");
  assert.equal(back.locked, false); assert.equal(back.segs.length, 2);
  assert.equal(await back.segs[0].blob.text(), "SEG-ONE-secret-pixels");
  assert.deepEqual((await st.list()).map(m => m.seat), ["12"]);
  // delete removes the record AND its key: a copied envelope can no longer be opened
  await st.del("node00000001-e1-ab");
  assert.equal(db.m.size, 0); assert.equal(keys.m.size, 0);
  await db.put(rec);
  assert.equal((await st.load("node00000001-e1-ab")).locked, true, "crypto-shredded");
  await st.del("node00000001-e1-ab");
  // auto-delete
  await st.save({ id: "n1-e2", t: now, sig: "extra", seat: "3" }, clip(), 1);
  await st.save({ id: "n1-e3", t: now, sig: "lean", seat: "4" }, clip(), 30);
  now += 2 * C.DAY;
  assert.deepEqual(await st.purge(now), ["n1-e2"]);
  assert.deepEqual((await st.list()).map(m => m.id), ["n1-e3"]);
  assert.equal(await st.count(), 1);
  assert.deepEqual(await st.delAll(), ["n1-e3"]);
});

test("store: an expired clip is never played (load deletes it); a non-encrypted write is refused even with allowPlaintext", async () => {
  V._reset(); const keys = memKeys(); V._setKeyStore(keys);
  const db = memDb(); let now = 1e12;
  const st = C.createStore({ vault: V, db, now: () => now });
  await st.save({ id: "n1-old", t: now, sig: "phone", seat: "1" }, clip(), 1);
  now += C.DAY + 1;
  assert.equal(await st.load("n1-old"), null, "past its auto-delete date");
  assert.equal(db.m.size, 0, "and deleted"); assert.equal(keys.m.size, 0, "with its key");
  // some other script switching LQVault to plaintext must not make a clip land unencrypted
  const plainVault = Object.assign({}, V, { write: async (n, data, ls) => { ls.setItem(n, JSON.stringify({ plain: "lq1", data })); return "plain"; } });
  const st2 = C.createStore({ vault: plainVault, db, now: () => now });
  await assert.rejects(st2.save({ id: "n1-p", t: now }, clip()), e => e.code === "insecure");
  const lying = Object.assign({}, V, { write: async (n, data, ls) => { ls.setItem(n, JSON.stringify({ plain: "lq1", data })); return "enc"; } });
  await assert.rejects(C.createStore({ vault: lying, db, now: () => now }).save({ id: "n1-q", t: now }, clip()), e => e.code === "insecure");
  assert.equal(db.m.size, 0, "nothing stored");
});

test("invigilator PIN: hashed (never stored), wrong tries locked out, cannot be reset without the old PIN", async () => {
  const m = new Map(); const ls = { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
  let now = 0; const pin = C.createPin({ ls, subtle: globalThis.crypto.subtle, rand: n => globalThis.crypto.getRandomValues(new Uint8Array(n)), now: () => now });
  assert.equal(pin.has(), false);
  assert.equal((await pin.verify("1234")).ok, false, "no PIN -> nothing unlocks");
  assert.equal((await pin.set("12")).ok, false); assert.equal((await pin.set("12ab")).ok, false);
  assert.ok((await pin.set("482913")).ok); assert.ok(pin.has());
  assert.ok(!m.get(pin.KEY).includes("482913"), "only a salted hash is stored");
  assert.ok((await pin.verify("482913")).ok);
  assert.equal((await pin.set("1111")).ok, false, "a candidate cannot overwrite the PIN");
  assert.equal((await pin.set("1111", "000000")).ok, false);
  // the two refused resets above already count as wrong tries (2 of 5)
  for (let i = 0; i < 2; i++) assert.equal((await pin.verify("000000")).why, "wrong");
  assert.equal((await pin.verify("000000")).why, "wait", "5th wrong try -> wait");
  assert.equal((await pin.verify("482913")).why, "wait", "even the right PIN waits");
  now += 61000;
  assert.ok((await pin.verify("482913")).ok);
  assert.ok((await pin.set("1111", "482913")).ok); assert.ok((await pin.verify("1111")).ok);
});

test("store: no secure context / no WebCrypto -> nothing stored (no plaintext fallback); bad ids and full device refused", async () => {
  V._reset(); V._setKeyStore(memKeys());
  const db = memDb();
  const insecure = C.createStore({ vault: Object.assign({}, V, { supported: () => false }), db });
  assert.equal(insecure.supported(), false);
  await assert.rejects(insecure.save({ id: "a1", t: 1 }, clip()), e => e.code === "insecure");
  assert.equal(db.m.size, 0);
  const st = C.createStore({ vault: V, db });
  await assert.rejects(st.save({ id: "../x y", t: 1 }, clip()), e => e.code === "bad");
  await assert.rejects(st.save({ id: "ok1", t: 1 }, { segs: [] }), e => e.code === "bad");
  for (let i = 0; i < C.MAX_KEPT; i++) await db.put({ id: "f" + i, t: i, exp: 1e15 });
  await assert.rejects(st.save({ id: "one-more", t: 1 }, clip()), e => e.code === "full");
});

test("messages: clip status + keep go through the strict allowlist; the video can never ride along", () => {
  const base = { v: 1, type: "clip", room: "R1", node: "abc123def456", src: "hall", seat: "4", t: 5, id: "e1-ab12", st: "pending" };
  assert.ok(E.cleanMsg(base).ok);
  assert.equal(E.cleanMsg({ ...base, data: "data:video/webm;base64,AAAA" }).error, "unknown key data");
  assert.equal(E.cleanMsg({ ...base, blob: "blob:x" }).ok, false);
  assert.equal(E.cleanMsg({ ...base, st: "guilty" }).error, "st");
  assert.equal(E.cleanMsg({ ...base, id: "../../etc" }).error, "id");
  assert.equal(E.cleanMsg({ ...base, days: 9999 }).error, "days");
  assert.equal(E.cleanMsg({ ...base, days: 14 }).msg.days, 14);
  const keep = { v: 1, type: "keep", room: "R1", node: "abc123def456", t: 9, id: "e1-ab12" };
  assert.ok(E.cleanMsg(keep).ok);
  assert.equal(E.cleanMsg({ ...keep, who: "Somchai" }).ok, false, "no names travel to the camera device");
  assert.equal(E.cleanMsg({ ...keep, node: "X" }).error, "node");
  const hb = E.cleanMsg({ v: 1, type: "hb", room: "R1", node: "abc123def456", src: "lab", name: "", seats: ["1"], t: 1, clip: 1 });
  assert.equal(hb.msg.clip, true);
});

test("board: flag row knows its clip status; 'keep clip' needs a name, is not a response, and targets the camera device", () => {
  const b = E.createBoard({ room: "R1" }), node = "node00000001";
  const ev = (t, id, x) => b.ingest(Object.assign({ v: 1, type: "ev", room: "R1", node, src: "lab", seat: "12", sig: "phone", lvl: "check", t, id }, x || {}), t);
  ev(1000, "e1-aa"); ev(2000, "e2-aa");
  const a = b.alerts[0];
  assert.deepEqual(a.eids, ["e1-aa", "e2-aa"], "bumped events keep their ids");
  assert.equal(b.clipState(a), null, "no clip yet");
  b.ingest({ v: 1, type: "clip", room: "R1", node, src: "lab", seat: "12", t: 1100, id: "e1-aa", st: "pending" }, 1100);
  assert.equal(b.clipState(a).st, "pending");
  assert.deepEqual(b.keepClip(a.id, "", 3000), [], "nameless keep refused");
  const msgs = b.keepClip(a.id, "Invigilator A", 3000);
  assert.deepEqual(msgs, [{ v: 1, type: "keep", room: "R1", node, t: 3000, id: "e1-aa" }]);
  assert.ok(msgs.every(m => E.cleanMsg(m).ok));
  assert.equal(a.acts[0].a, "keepclip"); assert.equal(a.acts[0].who, "Invigilator A");
  assert.equal(b.summary().acknowledged, 0, "keeping a clip is not a response to the flag");
  assert.equal(b.firstResp(a), null, "the printed report uses the same rule (board.firstResp)");
  b.ingest({ v: 1, type: "clip", room: "R1", node, src: "lab", seat: "12", t: 3100, id: "e1-aa", st: "kept", days: 14 }, 3100);
  assert.deepEqual(b.clipState(a), { st: "kept", days: 14, t: 3100, n: 1 });
  assert.deepEqual(b.keepClip(a.id, "Invigilator A", 3200), [], "nothing pending any more");
  // another node cannot attach a clip to this flag
  b.ingest({ v: 1, type: "clip", room: "R1", node: "othernode001", src: "lab", seat: "12", t: 3300, id: "e2-aa", st: "pending" }, 3300);
  assert.equal(b.clipsOf(a).length, 1);
  const csv = b.csv({ time: t => String(t), clip: c => (c ? "clip:" + c.st : "") }).slice(1).split("\r\n");
  assert.ok(/คลิป/.test(csv[0]), "clip column header"); assert.ok(csv[1].endsWith("clip:kept"), csv[1]);
  const b2 = E.createBoard({ room: "R1" }); assert.ok(b2.load(JSON.parse(JSON.stringify(b.toJSON()))));
  assert.equal(b2.clipState(b2.alerts[0]).st, "kept", "clip status survives a reload");
  // a room without clips keeps the original CSV columns
  const b3 = E.createBoard({ room: "R1" }); b3.ingest({ v: 1, type: "ev", room: "R1", node, src: "lab", seat: "1", sig: "phone", lvl: "check", t: 1 }, 1);
  assert.equal(b3.csv({}).slice(1).split("\r\n")[0].split(",").length, 9);
});

/* ---------- objective events only; no emotion / expression / age-gender API anywhere in LENSIQ Exam ---------- */
const EXAM_CODE = ["lensiq-exam.js", "lensiq-exam-clip.js", "lensiq-exam-face.js", "exam-lab.js", "exam-hall.js", "exam-dashboard.js", "exam-ui.js", "exam-link.js",
  "exam-clip-ui.js", "exam-landing.js"];
const EXAM_PAGES = ["exam.html", "exam-lab.html", "exam-hall.html", "exam-dashboard.html"];
const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

test("no emotion / expression / age-gender API is used by any exam file", () => {
  const EMO_API = new RegExp(["faceExpressionNet", "withFaceExpressions", "FaceExpressions", "faceExpression", "expressions\\b", "outputFaceBlendshapes",
    "faceBlendshapes", "blendshape", "ageGenderNet", "withAgeAndGender", "LENSIQ_AGE_GENDER", "emotion", "affect(iva|ive)", "sentiment"].join("|"), "i");
  for (const f of EXAM_CODE) {
    const code = stripComments(read(f)).replace(/"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g, '""'); // identifiers and calls only
    assert.ok(!EMO_API.test(code), f + ": " + (code.match(EMO_API) || [])[0]);
    // and no model / weight loaded by a name or path string (string literals only; i18n prose lives in i18n/*.js)
    const lits = (stripComments(read(f)).match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g) || []).join("\n");
    const MODEL = /face_?expression|age_?gender|blend_?shape|emotion|faceExpressionNet|ageGenderNet|faceRecognitionNet|face_recognition/i;
    assert.ok(!MODEL.test(lits), f + " names a model in a string: " + (lits.match(MODEL) || [])[0]);
  }
  for (const p of EXAM_PAGES) {
    const scripts = [...read(p).matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
    for (const s of scripts) assert.ok(!/expression|age-gender|agegender|emotion|faceread/i.test(s), p + " loads " + s);
  }
  // the face engine (lensiq-exam-face.js, since 2026-11-10 MediaPipe by default): the research-demo face-api path loads only
  // the detector + 68 landmarks with no descriptors (was: the same regex checks on exam-lab.js, which no longer touches face-api)
  const Face = require("../../lensiq-exam-face.js");
  assert.deepEqual([...Face.FACEAPI_NETS], ["tinyFaceDetector", "faceLandmark68Net"], "face-api: detector + 68 landmarks only");
  assert.equal(Face.FACEAPI_OPTS.descriptors, false, "no face descriptors (no identity)");
  const face = read("lensiq-exam-face.js");
  assert.ok(!/faceExpressionNet|ageGenderNet|faceRecognitionNet|withFaceDescriptors/.test(face), "no expression, age-gender, recognition net or descriptors");
  assert.match(face, /fa\.nets\[n\]\.loadFromUri/, "face-api nets are loaded only from FACEAPI_NETS");
  // MediaPipe: only these options are ever passed (anything else, e.g. per-face facial-movement scores, fails here)
  assert.deepEqual(Object.keys(Face.MP_OPTIONS).sort(), ["minFaceDetectionConfidence", "minFacePresenceConfidence", "minTrackingConfidence", "numFaces",
    "outputFacialTransformationMatrixes", "runningMode"]);
  // the exam pages themselves never load or call face-api.js
  const lab = read("exam-lab.js");
  assert.ok(!/faceapi\.|loadFromUri|detectFacesCascade|faceExpressionNet|ageGenderNet|faceRecognitionNet/.test(stripComments(lab)), "exam-lab.js calls no face-api API");
  for (const p of EXAM_PAGES) assert.ok(![...read(p).matchAll(/<script src="([^"]+)"/g)].some(m => /face-api/.test(m[1])), p + " loads vendor/face-api.js");
});

test("every exam flag is an objective event (presence, objects, position, browser / device state) — none is inferred feeling or intent", () => {
  const OBJECTIVE = {
    lab: ["noface", "multiface", "headturn", "phone", "object", "mouth", "gaze", "frozen"], // camera: faces counted, head angle, objects, lip movement (no audio)
    browser: ["virtualcam", "away", "fsexit", "clip", "paste", "print", "screens", "device", "net", "reload"],
    hall: ["empty", "back", "early", "extra", "aisle", "lean", "neighbour"], // seat enter / leave, people per seat, position
    room: ["setup", "room", "roommute", "note"]
  };
  const all = Object.values(OBJECTIVE).flat();
  assert.deepEqual(Object.keys(E.SIGNALS).sort(), all.slice().sort(), "a new signal must be reviewed and added here");
  for (const [id, s] of Object.entries(E.SIGNALS)) {
    assert.ok(OBJECTIVE[s.src].includes(id), id + " source " + s.src);
    assert.ok(!/อารมณ์|เครียด|กังวล|โกหก|ทุจริต|น่าสงสัย/.test(s.th), id + ": " + s.th);
  }
});

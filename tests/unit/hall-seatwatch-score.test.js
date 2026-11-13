// tests/unit/hall-seatwatch-score.test.js — tools/hall-seatwatch-score.mjs: the LOCKED scoring rule of the Exam hall
// "seat watch" measurement (docs/pilot/PILOT-HALL-SEATWATCH.md §4 – §7, docs/pilot/SEATWATCH-SCORING-TH.md): the label
// sheet, the room-clock conversion, which labelled facts are scoreable / grey, the matching window (5 s before the start
// to H + 15 s after it; `back` from the end of the leave), late alerts, repeats, false alerts, alerts in the camera-moved
// window, Wilson and exact Poisson intervals, the targets and the result sheet. Locked before the tool was written
// (stream H, 2026-11-13; hashes in ~/LENSIQ-field/evals/gate-hall-h/locked.sha256).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repo = path.join(__dirname, "..", "..");
const load = () => import(path.join(repo, "tools", "hall-seatwatch-score.mjs"));
const HEAD = "session_id,block,row,source,planned_time,event_type,seat,target_seat,on_time,actual_start,actual_end,walk_mode,object_on_chair,note,labeller";
const sheet = rows => [HEAD, ...rows].join("\n");
const T0 = Date.parse("2026-11-20T09:00:00.000Z");
/** an alert as exam-hall.js sends it; s = seconds on the room timer (clock without drift starting at T0) */
let seq = 0;
const ev = (s, sig, seat = "", lvl = "watch", extra = {}) => ({ v: 1, type: "ev", room: "R1", node: "abcdefghijkl", src: "hall", seat, sig, lvl, t: T0 + s * 1000, id: "e" + (++seq), ...extra });
const clock = { start: { timer: "00:00", laptop: new Date(T0).toISOString() }, end: { timer: "24:00", laptop: new Date(T0 + 1440e3).toISOString() } };
const block = (o = {}) => ({ block: "H1", seats: ["A1", "A2", "A3", "A4", "B1", "B2", "B3", "B4"], minLeaveMin: 30, clock, monitoredSec: 1440, ...o });

test("rule: frozen, versioned, the windows and thresholds of the protocol", async () => {
  const { RULE } = await load();
  assert.ok(Object.isFrozen(RULE));
  assert.equal(RULE.version, "seatwatch-score-v1");
  assert.deepEqual({ ...RULE.H }, { empty: 20, back: 2, early: 180, extra: 5, aisle: 8, lean: 4, phone: 2 });
  assert.equal(RULE.pre, 5); assert.equal(RULE.post, 15);
  assert.deepEqual({ ...RULE.scoreMin }, { LEAVE: 35, AISLE: 23, SECOND: 20, LEAN: 19, PHONE: 15 });
  assert.equal(RULE.earlyMin, 195); assert.equal(RULE.cooldown, 95); assert.equal(RULE.camMovedSec, 300);
  assert.deepEqual([...RULE.causes], ["person-missed", "object", "standing", "wrong-seat", "staff", "posture", "light", "camera-moved", "unknown"]);
});

test("clock: mm:ss and h:mm:ss; laptop time -> room timer with the start / end readings (drift corrected)", async () => {
  const { parseClock, toTimer } = await load();
  assert.equal(parseClock("01:12"), 72); assert.equal(parseClock("1:02:03"), 3723); assert.equal(parseClock(""), null);
  assert.throws(() => parseClock("1:2:3:4"));
  assert.equal(toTimer(T0 + 60e3, clock), 60);
  // laptop clock 2 s fast at the end of a 24-min block: halfway it is 1 s fast
  const drift = { start: { timer: "00:00", laptop: new Date(T0).toISOString() }, end: { timer: "24:00", laptop: new Date(T0 + 1442e3).toISOString() } };
  assert.ok(Math.abs(toTimer(T0 + 721e3, drift) - 720) < 1e-6);
  // without an end reading: offset only
  assert.equal(toTimer(T0 + 5e3, { start: { timer: "00:10", laptop: new Date(T0).toISOString() } }), 15);
});

test("label sheet: example rows skipped, struck rows (X) skipped, scripted lengths, actual times win, errors listed", async () => {
  const { parseLabelSheet } = await load();
  const r = parseLabelSheet(sheet([
    "EXAMPLE-delete-this-row,H1,1,scripted,00:00,LEAVE,B3,,Y,,01:12,,N,,ก.",
    "S1,H1,1,scripted,00:00,LEAVE,B3,,Y,,01:12,,N,,ก.",
    "S1,H1,2,scripted,00:05,AISLE,B3,X,Y,,,,,,ก.",
    "S1,H1,3,scripted,00:35,SECOND,B3,A3,N,00:41,01:06,,,late,ก.",
    "S1,H1,4,scripted,01:18,LEAN,B1,B2,X,,,,,,ก.",
    "S1,H1,5,unscripted,,LEAVE,A2,,,06:40,,,Y,,ก.",
    "S1,H1,6,scripted,09:15,STAFF_WALK,STAFF,,Y,,,on,,,ก."
  ]));
  assert.equal(r.events.length, 4);
  const [leave, aisle, second, walk] = r.events;
  assert.deepEqual([leave.type, leave.seat, leave.start, leave.end], ["LEAVE", "B3", 0, 72]);
  assert.deepEqual([aisle.type, aisle.start, aisle.end], ["AISLE", 5, 30], "scripted 25 s");
  assert.deepEqual([second.seat, second.target, second.start, second.end], ["B3", "A3", 41, 66]);
  assert.deepEqual([walk.type, walk.walk, walk.start, walk.end], ["STAFF_WALK", "on", 555, 585]);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /row 5.*LEAVE.*actual_end/);
});

test("expected signals: LEAVE -> empty + back (+ early), SECOND -> extra at the TARGET seat, scoreable vs grey", async () => {
  const { parseLabelSheet, expectedSignals } = await load();
  const { events } = parseLabelSheet(sheet([
    "S1,H1,1,scripted,00:00,LEAVE,B3,,Y,,01:10,,N,,a",
    "S1,H1,2,unscripted,,LEAVE,A1,,,02:00,02:30,,N,,a", // 30 s: grey
    "S1,H1,3,scripted,03:00,LEAVE,A2,,Y,,06:30,,N,,a", // 210 s inside the minimum leave time: early scoreable
    "S1,H1,4,scripted,07:00,SECOND,B1,A4,Y,,,,,,a",
    "S1,H1,5,scripted,08:00,AISLE,B1,X,Y,,,,,,a",
    "S1,H1,6,unscripted,,AISLE,,,,08:50,09:00,,,,a", // 10 s: grey
    "S1,H1,7,scripted,10:00,LEAN,B2,B1,Y,,,,,,a",
    "S1,H1,8,scripted,11:00,STAND,A3,,Y,,,,,,a",
    "S1,H1,9,scripted,12:00,STAFF_WALK,STAFF,,Y,,,off,,,a"
  ]));
  const x = expectedSignals(events, block());
  const of = (sig, seat) => x.filter(e => e.sig === sig && (seat == null || e.seat === seat));
  assert.equal(of("empty", "B3")[0].scoreable, true);
  assert.equal(of("back", "B3")[0].ref, 70, "back is judged from the end of the leave");
  assert.equal(of("empty", "A1")[0].scoreable, false); assert.equal(of("empty", "A1")[0].grey, true);
  assert.equal(of("early", "A2").length, 1); assert.equal(of("early", "A2")[0].scoreable, true);
  assert.equal(of("early", "B3").length, 0, "70 s is not an early leave");
  assert.equal(of("extra", "A4").length, 1, "second person: the seat that was visited");
  assert.equal(of("extra", "B1").length, 0);
  assert.equal(of("aisle").filter(e => e.scoreable).length, 2, "scripted aisle + the staff walk with walk mode OFF");
  assert.equal(of("aisle").filter(e => e.staff).length, 1);
  assert.equal(of("aisle").filter(e => e.grey).length, 1);
  assert.equal(of("lean", "B2").length, 1);
  assert.equal(x.filter(e => e.from === "STAND").length, 0, "standing raises no signal (not built)");
  // early: only the first long leave of a seat in the run, and only inside the minimum leave time
  const late = expectedSignals(parseLabelSheet(sheet(["S1,H1,1,scripted,29:00,LEAVE,A2,,Y,,33:00,,N,,a"])).events, block());
  assert.equal(late.filter(e => e.sig === "early").length, 0, "180 s after 29:00 is past the 30-min minimum");
});

test("matching: window -5 s .. H+15 s, one alert per event, late = miss but not false, repeats, false alerts", async () => {
  const { parseLabelSheet, scoreBlock } = await load();
  const { events } = parseLabelSheet(sheet([
    "S1,H1,1,scripted,00:00,LEAVE,B3,,Y,,01:10,,N,,a",      // empty found at 21 s, back found at 72 s
    "S1,H1,2,scripted,02:00,LEAVE,B4,,Y,,03:10,,N,,a",      // empty only at 160 s: window ends 120+35=155 -> late (still away)
    "S1,H1,3,scripted,05:00,SECOND,B1,A4,Y,,,,,,a",          // extra watch 306, check 316 (repeat)
    "S1,H1,4,scripted,08:00,LEAN,B2,B1,Y,,,,,,a"             // missed
  ]));
  const alerts = [
    ev(21, "empty", "B3", "info", { dur: 20000 }), ev(72, "back", "B3", "info", { dur: 51000 }),
    ev(160, "empty", "B4", "info", { dur: 40000 }), ev(191, "back", "B4", "info", { dur: 70000 }),
    ev(306, "extra", "A4", "watch"), ev(316, "extra", "A4", "check"),
    ev(600, "aisle", "", "watch"),                             // nothing labelled: false
    ev(700, "room", "", "info"), ev(710, "setup", "", "setup")
  ];
  const r = scoreBlock({ events, alerts, block: block() });
  const s = r.bySig;
  assert.deepEqual([s.empty.scoreable, s.empty.found, s.empty.late], [2, 1, 1]);
  assert.deepEqual([s.back.scoreable, s.back.found], [2, 2], "back of B4 at 191 s is inside 190 -5 .. +15");
  assert.deepEqual([s.extra.scoreable, s.extra.found, s.extra.repeats], [1, 1, 1]);
  assert.deepEqual([s.lean.scoreable, s.lean.found], [1, 0]);
  assert.equal(r.falseAlerts.length, 1); assert.equal(r.falseAlerts[0].sig, "aisle");
  assert.deepEqual(r.nonAlerts, { room: 1, setup: 1 });
  assert.deepEqual(s.empty.times, [21], "time to alert = alert - labelled start");
  assert.deepEqual(s.back.times, [2, 1]);
  assert.deepEqual(r.awayErr, [19, 0], "|back.dur - labelled time away| in s");
  assert.equal(r.misses.length, 2, "late empty of B4 + missed lean");
  assert.ok(r.misses.some(m => m.sig === "empty" && m.late));
});

test("matching: wrong seat = false at the shown seat AND a miss; grey events never a miss and absorb their alert", async () => {
  const { parseLabelSheet, scoreBlock } = await load();
  const { events } = parseLabelSheet(sheet([
    "S1,H1,1,scripted,00:00,LEAVE,B3,,Y,,01:10,,N,,a",
    "S1,H1,2,unscripted,,LEAVE,A1,,,02:00,02:30,,N,,a"
  ]));
  const r = scoreBlock({ events, alerts: [ev(21, "empty", "B2", "info"), ev(140, "empty", "A1", "info")], block: block() });
  assert.equal(r.bySig.empty.scoreable, 1); assert.equal(r.bySig.empty.found, 0);
  assert.equal(r.falseAlerts.length, 1); assert.equal(r.falseAlerts[0].seat, "B2");
  assert.equal(r.bySig.empty.greyHits, 1, "the alert on the 30-s leave is a true alert, not counted for recall");
  assert.equal(r.bySig.empty.trueAlerts, 1);
});

test("cooldown: a second event inside 95 s of an alert of that signal and seat is not scoreable (grey)", async () => {
  const { parseLabelSheet, scoreBlock } = await load();
  const { events } = parseLabelSheet(sheet([
    "S1,H1,1,scripted,00:00,AISLE,B1,X,Y,,,,,,a",
    "S1,H1,2,scripted,01:00,AISLE,B2,X,Y,,,,,,a"
  ]));
  const r = scoreBlock({ events, alerts: [ev(9, "aisle")], block: block() });
  assert.equal(r.bySig.aisle.scoreable, 1);
  assert.equal(r.bySig.aisle.found, 1);
  assert.equal(r.bySig.aisle.cooldownGrey, 1);
});

test("camera moved: alerts in the 300 s after CAM_MOVED are counted apart, not as false alerts", async () => {
  const { parseLabelSheet, scoreBlock } = await load();
  const { events } = parseLabelSheet(sheet(["S1,H1,1,unscripted,,CAM_MOVED,,,,20:00,,,,,a"]));
  const r = scoreBlock({ events, alerts: [ev(1210, "empty", "A1", "info"), ev(1300, "lean", "A2"), ev(1600, "lean", "A3")], block: block() });
  assert.equal(r.camMoved.length, 2);
  assert.equal(r.falseAlerts.length, 1);
});

test("walk mode on: a staff walk raises no expected signal; an alert during it is false with the cause hint 'staff'", async () => {
  const { parseLabelSheet, scoreBlock } = await load();
  const { events } = parseLabelSheet(sheet(["S1,H1,1,scripted,09:15,STAFF_WALK,STAFF,,Y,,,on,,,a", "S1,H1,2,scripted,11:00,STAND,A3,,Y,,,,,,a"]));
  const r = scoreBlock({ events, alerts: [ev(570, "extra", "A1"), ev(661, "empty", "A3", "info")], block: block() });
  assert.equal(r.falseAlerts.length, 2);
  assert.equal(r.falseAlerts.find(f => f.sig === "extra").hint, "staff");
  assert.equal(r.falseAlerts.find(f => f.sig === "empty").hint, "standing");
});

test("phone: scored only when the block has the phone signal on; otherwise a phone alert is false", async () => {
  const { parseLabelSheet, scoreBlock } = await load();
  const { events } = parseLabelSheet(sheet(["S1,P,1,scripted,00:10,PHONE_DESK,A1,,Y,,,,,,a"]));
  const on = scoreBlock({ events, alerts: [ev(12, "phone", "A1", "check")], block: block({ block: "P", phoneOn: true }) });
  assert.deepEqual([on.bySig.phone.scoreable, on.bySig.phone.found, on.falseAlerts.length], [1, 1, 0]);
  const off = scoreBlock({ events, alerts: [ev(12, "phone", "A1", "check")], block: block({ block: "P" }) });
  assert.equal(off.bySig.phone, undefined);
  assert.equal(off.falseAlerts.length, 1);
});

test("intervals: Wilson; exact Poisson (0 seen: 3.689 two-sided upper, 2.996 one-sided)", async () => {
  const { wilson, poisson } = await load();
  const w = wilson(55, 60);
  assert.ok(Math.abs(w.lo - 0.8193) < 0.001, String(w.lo));
  const w2 = wilson(54, 60);
  assert.ok(Math.abs(w2.lo - 0.7985) < 0.001, String(w2.lo));
  const p0 = poisson(0);
  assert.equal(p0.lo, 0);
  assert.ok(Math.abs(p0.hi - 3.6889) < 0.001, String(p0.hi));
  assert.ok(Math.abs(p0.hi1 - 2.9957) < 0.001, String(p0.hi1));
  const p3 = poisson(3);
  assert.ok(Math.abs(p3.lo - 0.6187) < 0.001 && Math.abs(p3.hi - 8.7673) < 0.001, JSON.stringify(p3));
});

test("summary and targets: held-out only, 'not enough events' under 55, false alerts per seat-hour judged on variant A", async () => {
  const { summarize } = await load();
  const mk = (sig, n, found) => ({ scoreable: n, found, late: 0, repeats: 0, greyHits: 0, trueAlerts: found, times: Array(found).fill(21), cooldownGrey: 0 });
  const blockRes = (split, variant, bySig, falses = 0) => ({ split, variant, seatHours: 8 * 0.4, bySig, falseAlerts: Array.from({ length: falses }, (_, i) => ({ id: "f" + i, sig: "empty", lvl: "info" })),
    camMoved: [], misses: [], nonAlerts: {}, awayErr: [3, 5, 12], fps: [3, 2.8] });
  const S = summarize([
    blockRes("dev", "B", { empty: mk("empty", 14, 10) }, 4),
    blockRes("heldout", "B", { empty: mk("empty", 60, 55), back: mk("back", 60, 54), extra: mk("extra", 40, 40) }, 1)
  ], { causes: { f0: "unsure" } });
  const h = S.heldout;
  assert.equal(h.bySig.empty.found, 55);
  assert.equal(h.targets.T1.empty.pass, true);
  assert.equal(h.targets.T1.back.pass, false, "54 of 60 -> lower bound 79.9 % < 80 %");
  assert.equal(h.targets.T2.extra.pass, null); assert.match(h.targets.T2.extra.note, /not enough events/);
  assert.equal(h.targets.T4.pass, null, "variant B cannot judge the false-alert target");
  assert.equal(h.falseMain, 0, "the unsure alert is out of the main line");
  assert.equal(h.falseWorst, 1, "and in the worst-case line");
  assert.equal(S.dev.bySig.empty.scoreable, 14, "dev reported separately");
  assert.equal(h.targets.T6.median, 5);
});

test("result sheet: source line, dev and held-out apart, every target row, no names", async () => {
  const { summarize, formatSheet } = await load();
  const S = summarize([{ split: "heldout", variant: "B", seatHours: 3.2, bySig: { empty: { scoreable: 2, found: 2, late: 0, repeats: 0, greyHits: 0, trueAlerts: 2, times: [21, 22], cooldownGrey: 0 } },
    falseAlerts: [], camMoved: [], misses: [], nonAlerts: {}, awayErr: [], fps: [3] }], {});
  const md = formatSheet(S, { session: "S1", date: "2026-11-20" });
  assert.match(md, /source: field \(mock exam, adult volunteers, scripted\)/i);
  assert.match(md, /ที่มา: หน้างานจริง \(สอบจำลอง อาสาสมัครผู้ใหญ่ ทำตามบท\)/);
  assert.match(md, /held-out/i);
  for (const sig of ["empty", "back", "aisle", "extra", "lean", "early"]) assert.match(md, new RegExp(`\\| ${sig}`));
  assert.match(md, /seatwatch-score-v1/);
});

test("CLI: whole run on a temp session; output refused inside the repo; logs as exported by exam-hall.html", async () => {
  const { main } = await load();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lq-sw-"));
  fs.writeFileSync(path.join(dir, "labels.csv"), sheet(["S1,H1,1,scripted,00:00,LEAVE,B3,,Y,,01:10,,N,,a"]));
  fs.writeFileSync(path.join(dir, "H1.json"), JSON.stringify({ format: "lensiq-exam", v: 1, msgs: [ev(21, "empty", "B3", "info", { dur: 20000 }), ev(72, "back", "B3", "info", { dur: 51000 })] }));
  fs.writeFileSync(path.join(dir, "session.json"), JSON.stringify({ session: "S1", variant: "B", split: "heldout", labels: "labels.csv", blocks: [{ ...block(), log: "H1.json" }] }));
  const out = path.join(dir, "out");
  const logs = []; const log = s => logs.push(s);
  assert.equal(await main(["--session", path.join(dir, "session.json"), "--out", out], { log, err: log }), 0);
  const md = fs.readFileSync(path.join(out, "RESULT-SHEET.md"), "utf8");
  assert.match(md, /\| empty \| 1 \| 1 \|/);
  assert.ok(fs.existsSync(path.join(out, "alerts.csv")) && fs.existsSync(path.join(out, "events.csv")) && fs.existsSync(path.join(out, "result.json")));
  assert.equal(await main(["--session", path.join(dir, "session.json"), "--out", path.join(repo, "docs", "x")], { log, err: log }), 2);
  assert.ok(logs.some(l => /outside the repo/.test(l)));
});

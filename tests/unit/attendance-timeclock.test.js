"use strict";
// tests/unit/attendance-timeclock.test.js — employee time attendance (attendance.html employee mode):
// lensiq-timeclock.js shift / late / early-leave / OT / night-shift / break maths, Thai holidays + substitution, leave,
// monthly summary + payroll CSV, append-only hash-chained audit log + corrections, PIN / QR fallback, multi-device pack,
// s.114 retention; attendance-qr.js QR encoder; every attendance-hr.js text key has English + Chinese.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const C = require("../../lensiq-timeclock.js");
const Q = require("../../attendance-qr.js");

const ROOT = path.join(__dirname, "..", "..");
const T = (d, hm) => C.dayStart(d) + C.hm(hm) * 60000; // local (UTC+7) time -> epoch ms
const P = (id, d, hm, type = "auto", method = "face", emp = "e1") => ({ id, emp, ts: T(d, hm), type, method, dev: "dtest0001" });
const DAY = C.normShift({ id: "day", start: "08:00", end: "17:00" });       // grace 5, OT min 30, round 15, break 60
const NIGHT = C.normShift({ id: "night", start: "22:00", end: "06:00" });
const LATER = T("2030-01-01", "00:00");

test("clock helpers use a fixed UTC+7 offset (same result on every device)", () => {
  assert.equal(C.hm("08:30"), 510); assert.ok(isNaN(C.hm("24:00"))); assert.ok(isNaN(C.hm("8:30")));
  assert.equal(C.fmtHM(510), "08:30"); assert.equal(C.fmtHM(1440 + 61), "01:01");
  const ts = Date.UTC(2026, 10, 8, 17, 30); // 2026-11-08 17:30 UTC = 2026-11-09 00:30 in Bangkok
  assert.equal(C.dateKey(ts), "2026-11-09"); assert.equal(C.clock(ts), "00:30");
  assert.equal(C.weekday("2026-11-09"), 1); assert.equal(C.addDays("2026-02-28", 1), "2026-03-01");
  assert.equal(C.monthDays("2026-02").length, 28); assert.equal(C.weekOf("2026-11-08"), "2026-11-02");
  assert.ok(C.isDate("2026-02-28") && !C.isDate("2026-02-30") && !C.isDate("2026-2-3"));
});

test("normShift: defaults, clamps, rejects malformed times; night shifts cross midnight", () => {
  assert.deepEqual([DAY.breakMin, DAY.graceLate, DAY.otMinMin, DAY.otRound, DAY.days.join()], [60, 5, 30, 15, "1,2,3,4,5"]);
  const s = C.normShift({ start: "09:00", end: "18:00", graceLate: 999, otRound: 0, days: [6, 0, 9, 1.5] });
  assert.equal(s.graceLate, 120); assert.equal(s.otRound, 1); assert.deepEqual(s.days, [0, 6]);
  assert.throws(() => C.normShift({ start: "9", end: "18:00" }));
  assert.ok(C.crossesMidnight(NIGHT) && !C.crossesMidnight(DAY));
  assert.equal(C.shiftMinutes(DAY), 480); assert.equal(C.shiftMinutes(NIGHT), 420);
});

test("shiftDateOf: punches belong to the shift date (night shift after midnight -> previous day)", () => {
  assert.equal(C.shiftDateOf(T("2026-11-10", "02:00"), NIGHT), "2026-11-09");
  assert.equal(C.shiftDateOf(T("2026-11-09", "21:30"), NIGHT), "2026-11-09");
  assert.equal(C.shiftDateOf(T("2026-11-10", "06:40"), NIGHT), "2026-11-09");
  // day shift: the slice starts 4 h before 08:00
  assert.equal(C.shiftDateOf(T("2026-11-10", "03:59"), DAY), "2026-11-09");
  assert.equal(C.shiftDateOf(T("2026-11-10", "04:00"), DAY), "2026-11-10");
});

test("late / early leave with grace minutes (within grace = on time, beyond = all minutes)", () => {
  const d = "2026-11-09", sum = (i, o) => C.daySummary(DAY, d, [P("a", d, i), P("b", d, o)], { now: LATER });
  assert.equal(sum("08:05", "17:00").lateMin, 0);
  assert.equal(sum("08:06", "17:00").lateMin, 6);
  const r = sum("07:55", "16:50");
  assert.equal(r.lateMin, 0); assert.equal(r.earlyMin, 10); assert.deepEqual(r.flags, ["early"]);
  assert.equal(C.daySummary(C.normShift({ start: "08:00", end: "17:00", graceEarly: 10 }), d, [P("a", d, "08:00"), P("b", d, "16:50")], { now: LATER }).earlyMin, 0);
});

test("OT: minimum, rounding down, start-after, approval", () => {
  const d = "2026-11-09", ot = (o, sh = DAY, opts = {}) => C.daySummary(sh, d, [P("a", d, "08:00"), P("b", d, o)], Object.assign({ now: LATER }, opts));
  assert.equal(ot("17:29").otMin, 0);
  assert.equal(ot("17:30").otMin, 30);
  assert.equal(ot("17:44").otMin, 30);
  assert.equal(ot("17:45").otMin, 45);
  assert.equal(ot("19:10").otMin, 120);
  assert.equal(ot("17:45", C.normShift({ start: "08:00", end: "17:00", otStartAfter: 15 })).otMin, 30);
  const appr = C.normShift({ start: "08:00", end: "17:00", otApproval: true });
  const p = ot("18:00", appr);
  assert.equal(p.otMin, 0); assert.equal(p.otRawMin, 60); assert.ok(p.otPending && p.flags.includes("ot_pending"));
  assert.equal(ot("18:00", appr, { otApproved: true }).otMin, 60);
});

test("breaks: recorded pairs, long break, default deduction only over 5 h, missing break-in", () => {
  const d = "2026-11-09";
  const r = C.daySummary(DAY, d, [P("a", d, "08:00", "in"), P("b", d, "12:00", "break_out"), P("c", d, "13:20", "break_in"), P("d", d, "17:00", "out")], { now: LATER });
  assert.equal(r.breakMin, 80); assert.equal(r.breakOverMin, 20); assert.ok(r.flags.includes("long_break")); assert.equal(r.workedMin, 540 - 80);
  assert.equal(C.daySummary(DAY, d, [P("a", d, "08:00"), P("b", d, "17:00")], { now: LATER }).workedMin, 480);
  assert.equal(C.daySummary(DAY, d, [P("a", d, "08:00"), P("b", d, "12:00")], { now: LATER }).workedMin, 240);
  const m = C.daySummary(DAY, d, [P("a", d, "08:00", "in"), P("b", d, "12:00", "break_out"), P("d", d, "17:00", "out")], { now: LATER });
  assert.ok(m.flags.includes("missing_break_in"));
  // explicit types win over auto: in = first "in", out = last "out"
  const t = C.daySummary(DAY, d, [P("a", d, "07:50", "auto"), P("b", d, "08:10", "in"), P("c", d, "17:30", "out"), P("e", d, "17:40", "auto")], { now: LATER });
  assert.equal(C.clock(t.in), "08:10"); assert.equal(C.clock(t.out), "17:30");
});

test("night shift crossing midnight: late, OT and worked minutes on the start date", () => {
  const r = C.daySummary(NIGHT, "2026-11-09", [P("a", "2026-11-09", "22:10"), P("b", "2026-11-10", "07:00")], { now: LATER });
  assert.equal(r.lateMin, 10); assert.equal(r.otMin, 60); assert.equal(r.workedMin, 530 - 60); assert.equal(r.status, "present");
});

test("status: absent / pending / incomplete / on duty / leave / holiday work", () => {
  const d = "2026-11-09", noon = T(d, "12:00");
  assert.equal(C.daySummary(DAY, d, [], { now: LATER }).status, "absent");
  assert.equal(C.daySummary(DAY, d, [], { now: noon }).status, "pending");
  assert.equal(C.daySummary(DAY, d, [P("a", d, "08:00")], { now: noon }).status, "on_duty");
  const inc = C.daySummary(DAY, d, [P("a", d, "08:00")], { now: LATER });
  assert.equal(inc.status, "incomplete"); assert.ok(inc.flags.includes("missing_out"));
  assert.equal(C.daySummary(DAY, d, [], { now: LATER, leave: { type: "sick", part: 1 } }).status, "leave");
  const half = C.daySummary(DAY, d, [P("a", d, "13:00"), P("b", d, "17:00")], { now: LATER, leave: { type: "personal", part: 0.5 } });
  assert.equal(half.lateMin, 0); assert.ok(half.flags.includes("half_leave"));
  const hol = C.daySummary(DAY, d, [P("a", d, "08:00"), P("b", d, "19:00")], { now: LATER, kind: "holiday" });
  assert.equal(hol.holidayMin, 480); assert.equal(hol.holidayOtMin, 120); assert.equal(hol.otMin, 0); assert.equal(hol.lateMin, 0);
});

test("Thai holidays: fixed + 2026 lunar dates, substitution when a holiday falls on a rest day (s.29)", () => {
  const h = C.thaiHolidays(2026);
  assert.equal(h.length, 18);
  assert.ok(h.some(x => x.date === "2026-05-01" && x.key === "labour") && h.some(x => x.key === "visakha"));
  assert.ok(C.hasLunar(2026) && !C.hasLunar(2027)); assert.equal(C.thaiHolidays(2027).length, 15);
  const m = C.holidayMap(h, [1, 2, 3, 4, 5]);
  assert.equal(m.get("2026-06-01").sub, "2026-05-31"); assert.equal(m.get("2026-12-07").sub, "2026-12-05");
  assert.equal(C.holidayMap(h, [0, 1, 2, 3, 4, 5, 6]).size, 18); // no rest day -> no substitution
  assert.equal(C.dayKind(DAY, "2026-10-13", m), "holiday"); assert.equal(C.dayKind(DAY, "2026-10-10", m), "off"); assert.equal(C.dayKind(DAY, "2026-10-12", m), "work");
  const lm = C.leaveMap([{ emp: "e1", date: "2026-10-06", type: "sick" }, { emp: "e1", date: "2026-10-07", type: "x", part: 0.5 }, { emp: "e1", date: "2026-10-08", type: "sick", removed: 1 }, { emp: "e2", date: "2026-10-06", type: "sick" }], "e1");
  assert.deepEqual([...lm.entries()], [["2026-10-06", { type: "sick", part: 1 }], ["2026-10-07", { type: "other", part: 0.5 }]]);
});

test("sha256 matches node:crypto (UTF-8, multi-block)", () => {
  for (const s of ["", "abc", "ทดสอบ".repeat(40), "x".repeat(55), "x".repeat(56), "x".repeat(64)]) assert.equal(C.sha256(s), crypto.createHash("sha256").update(s).digest("hex"));
});

test("audit log: who + reason required, per-device hash chain, tampering / deletion / reordering detected", () => {
  assert.throws(() => C.auditEntry([], { action: "punch_add", by: "", reason: "x" }, "dA"), /who/);
  assert.throws(() => C.auditEntry([], { action: "punch_add", by: "boss", reason: "" }, "dA"), /reason/);
  assert.throws(() => C.auditEntry([], { action: "nope", by: "boss", reason: "x" }, "dA"));
  let log = [];
  const add = (e, dev, t) => { log = log.concat([C.auditEntry(log, Object.assign({ by: "boss", reason: "r" }, e), dev, t)]); };
  add({ action: "punch_add", after: { id: "m1", emp: "e1", ts: 1, type: "in" } }, "dA", 1000);
  add({ action: "punch_void", target: "p1", before: { ts: 5 } }, "dA", 2000);
  add({ action: "emp_add", reason: "" }, "dB", 1500);
  add({ action: "leave_add", emp: "e1" }, "dA", 3000);
  assert.deepEqual(log.map(e => e.dev + e.seq), ["dA1", "dA2", "dB1", "dA3"]);
  assert.equal(log[1].prev, log[0].hash); assert.equal(log[2].prev, "0".repeat(64));
  assert.deepEqual(C.verifyAudit(log), { ok: true, bad: [], truncated: [] });
  const edited = JSON.parse(JSON.stringify(log)); edited[1].reason = "changed";
  assert.deepEqual(C.verifyAudit(edited).bad, [log[1].id]);
  const before = JSON.parse(JSON.stringify(log)); before[0].after.ts = 2;
  assert.ok(!C.verifyAudit(before).ok);
  assert.ok(!C.verifyAudit(log.filter((e, i) => i !== 1)).ok, "a deleted middle entry breaks the chain");
  // a purged head (retention) is reported as truncated, not as tampering
  const r = C.verifyAudit(log.filter((e, i) => i !== 0));
  assert.ok(r.ok && r.truncated.includes("dA"));
});

test("applyCorrections: add / void / edit derive effective punches; raw punches are never changed", () => {
  const raw = [P("p1", "2026-11-09", "08:20"), P("p2", "2026-11-09", "17:00")];
  const frozen = JSON.stringify(raw);
  let log = [];
  const add = e => { log = log.concat([C.auditEntry(log, Object.assign({ by: "boss", reason: "fix" }, e), "dA", 1000 + log.length)]); };
  add({ action: "punch_edit", target: "p1", before: { ts: raw[0].ts }, after: { ts: T("2026-11-09", "08:00") } });
  add({ action: "punch_add", after: P("m1", "2026-11-09", "12:00", "break_out", "manual") });
  add({ action: "punch_add", after: P("m2", "2026-11-09", "13:00", "break_in", "face") });
  add({ action: "punch_void", target: "m2" });
  const eff = C.applyCorrections(raw, log);
  assert.equal(JSON.stringify(raw), frozen);
  assert.deepEqual(eff.map(p => [p.id, C.clock(p.ts), !!p.corrected, p.method]), [["p1", "08:00", true, "face"], ["m1", "12:00", true, "manual"], ["p2", "17:00", false, "face"]]);
  const s = C.daySummary(DAY, "2026-11-09", eff, { now: LATER });
  assert.equal(s.lateMin, 0); assert.equal(s.corrected, 2); assert.ok(s.flags.includes("missing_break_in"));
  const appr = C.otApprovals([{ action: "ot_approve", target: "e1|2026-11-09", at: 1 }, { action: "ot_approve", target: "e1|2026-11-10", at: 2 }, { action: "ot_approve", target: "e1|2026-11-10", after: { approved: false }, at: 3 }]);
  assert.deepEqual([...appr], ["e1|2026-11-09"]);
});

const EMPS = [{ id: "e1", code: "A01", name: "สมชาย", dept: "ผลิต", shift: "day" }, { id: "e2", code: "B02", name: "=HYPERLINK(\"x\")", dept: "บัญชี", shift: "night" }];
function october() {
  const punches = [P("1", "2026-10-05", "08:12"), P("2", "2026-10-05", "18:05"), P("3", "2026-10-06", "07:58"), P("4", "2026-10-06", "17:02"),
    P("5", "2026-10-12", "08:00"), // incomplete
    P("6", "2026-10-13", "09:00"), P("7", "2026-10-13", "13:00"), // holiday work (Oct 13)
    P("n1", "2026-10-31", "22:00", "auto", "pin", "e2"), P("n2", "2026-11-01", "06:00", "auto", "pin", "e2")]; // night shift at month end
  // a heavy OT week (Mon 19 – Thu 22 Oct; Fri 23 Oct is a holiday): 4 days x 10 h OT
  for (const [i, d] of ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22"].entries()) punches.push(P("w" + i, d, "08:00"), P("x" + i, C.addDays(d, 1), "03:00"));
  return punches;
}
test("monthSummary: days, late, early, OT, holiday work, leave, absences, incomplete, weekly OT > 36 h, dept filter", () => {
  const leave = [{ emp: "e1", date: "2026-10-07", type: "sick" }, { emp: "e1", date: "2026-10-08", type: "annual", part: 0.5 }];
  const s = C.monthSummary({ emps: EMPS, shifts: [DAY, NIGHT], punches: october(), leave, holidays: C.thaiHolidays(2026), month: "2026-10", now: LATER });
  const a = s.rows.find(r => r.code === "A01");
  assert.equal(a.scheduled, 20);
  assert.equal(a.lateCount, 1); assert.equal(a.lateMin, 12);
  assert.equal(a.holidayDays, 1); assert.equal(a.holidayMin, 240);
  assert.equal(a.leave.sick, 1); assert.equal(a.leave.annual, 0.5); assert.equal(a.leaveDays, 1.5);
  assert.equal(a.incompleteDays, 1);
  // 03:00 next day: OT 10 h minus nothing (17:00 -> 03:00) = 600 min per day on Oct 19-22 + 60 on Oct 5
  assert.equal(a.otMin, 60 + 4 * 600);
  assert.ok(a.weekOtOver.includes("2026-10-19") && a.maxWeekOtMin === 2400);
  const worked = 2 + 1 + 4 + 1; // Oct 5, 6, 12 (incomplete), 19-22, + holiday Oct 13
  assert.equal(a.daysWorked, worked);
  assert.equal(a.absentDays, 20 - 7 - 1 - 1 + 0.5); // 20 scheduled - 7 attended work days - 1 sick - the half-day leave day, which has no punch -> 0.5 absent
  const b = s.rows.find(r => r.code === "B02");
  assert.equal(b.daysWorked, 1); assert.equal(s.days.get("e2").find(d => d.date === "2026-10-31").status, "present"); // 31 Oct is a Saturday: rest-day work
  assert.equal(b.methods.pin, 2);
  assert.deepEqual(C.monthSummary({ emps: EMPS, shifts: [DAY, NIGHT], punches: october(), month: "2026-10", dept: "บัญชี", now: LATER }).rows.map(r => r.code), ["B02"]);
  assert.deepEqual(a.weekNormalOver, []); assert.equal(a.maxWeekNormalMin, 4 * 480);
});

test("weekly limits use whole Monday–Sunday weeks across the month boundary (s.23 48 h normal, s.26 36 h OT)", () => {
  const six = C.normShift({ id: "six", start: "08:00", end: "17:00", days: [1, 2, 3, 4, 5, 6], breakMin: 0, otMinMin: 600 });
  // week of Mon 26 Oct – Sun 1 Nov 2026: 9 h a day, Mon–Sat = 54 h normal; only Sun 1 Nov is in November
  const ps = [];
  for (let i = 0; i < 6; i++) { const d = C.addDays("2026-10-26", i); ps.push(P("i" + i, d, "08:00"), P("o" + i, d, "17:00")); }
  const nov = C.monthSummary({ emps: [{ id: "e1", code: "A01", name: "x", shift: "six" }], shifts: [six], punches: ps, month: "2026-11", now: LATER }).rows[0];
  assert.ok(nov.weekNormalOver.includes("2026-10-26"), "the Oct/Nov week is checked in November too");
  assert.equal(nov.maxWeekNormalMin, 6 * 540); assert.equal(nov.daysWorked, 0);
  const oct = C.monthSummary({ emps: [{ id: "e1", code: "A01", name: "x", shift: "six" }], shifts: [six], punches: ps, month: "2026-10", now: LATER }).rows[0];
  assert.ok(oct.weekNormalOver.includes("2026-10-26"));
  assert.ok(C.payrollCsv({ month: "2026-10", rows: [oct] }).includes("week_normal_over_48h"));
});

test("shift history: a shift change applies from its date and does not rewrite earlier days", () => {
  const ps = [P("a", "2026-10-05", "08:20"), P("b", "2026-10-05", "17:00"), P("c", "2026-10-20", "22:20"), P("d", "2026-10-21", "06:00")];
  const emp = { id: "e1", code: "A01", name: "x", shift: "night", shiftHist: [{ from: "2026-01-01", shift: "day" }, { from: "2026-10-19", shift: "night" }] };
  const s = C.monthSummary({ emps: [emp], shifts: [DAY, NIGHT], punches: ps, month: "2026-10", now: LATER });
  const d5 = s.days.get("e1").find(d => d.date === "2026-10-05"), d20 = s.days.get("e1").find(d => d.date === "2026-10-20");
  assert.equal(d5.lateMin, 20, "Oct 5 measured against the day shift"); assert.equal(d20.lateMin, 20, "Oct 20 against the night shift");
  assert.equal(C.clock(d20.out), "06:00"); assert.equal(s.rows[0].shift, NIGHT.name);
  // without history the current shift is used for every day (older data)
  const flat = C.monthSummary({ emps: [{ id: "e1", code: "A01", name: "x", shift: "night" }], shifts: [DAY, NIGHT], punches: ps, month: "2026-10", now: LATER });
  assert.notEqual(flat.days.get("e1").find(d => d.date === "2026-10-05").lateMin, 20);
});

test("leave usage per year with statutory reference points", () => {
  const u = C.leaveUsage([{ emp: "e1", date: "2026-01-05", type: "sick" }, { emp: "e1", date: "2026-02-05", type: "sick", part: 0.5 }, { emp: "e1", date: "2026-03-05", type: "annual", removed: 1 }, { emp: "e1", date: "2025-12-31", type: "sick" }, { emp: "e2", date: "2026-04-01", type: "weird" }], 2026);
  assert.equal(u.get("e1").sick, 1.5); assert.equal(u.get("e1").annual, 0); assert.equal(u.get("e2").other, 1);
  assert.deepEqual(C.LEAVE_REF, { sick: 30, personal: 3, annual: 6 });
});

test("payroll / daily / audit CSV: BOM, bilingual headers, hours, formula-injection guard", () => {
  const s = C.monthSummary({ emps: EMPS, shifts: [DAY, NIGHT], punches: october(), holidays: C.thaiHolidays(2026), month: "2026-10", now: LATER });
  const csv = C.payrollCsv(s);
  assert.ok(csv.startsWith("﻿"));
  const lines = csv.slice(1).split("\r\n");
  assert.equal(lines.length, 3);
  for (const h of ["days_worked", "late_minutes", "early_leave_minutes", "ot_hours", "sick_leave", "absent_days", "manager_corrections"]) assert.ok(lines[0].includes(h), h);
  assert.ok(lines[1].includes('"41.00"'), "OT hours as decimals: " + lines[1]);
  assert.ok(lines[2].includes(`"'=HYPERLINK(""x"")"`), "formula neutralised: " + lines[2]);
  assert.equal(C.csvCell("+1"), `"'+1"`); assert.equal(C.csvCell("-x"), `"'-x"`); assert.equal(C.csvCell("@a"), `"'@a"`); assert.equal(C.csvCell(5), `"5"`);
  const det = C.detailCsv(s);
  assert.ok(/"2026-10-31".*"22:00","06:00 \(\+1\)"/.test(det), "night shift out on the next day marked (+1)");
  const log = [C.auditEntry([], { action: "punch_add", by: "boss", reason: "ลืมสแกน", emp: "e1", after: P("m", "2026-10-07", "17:00", "out", "manual") }, "dA", T("2026-10-08", "09:00"))];
  const a = C.auditCsv(log, EMPS);
  assert.ok(a.includes('"boss"') && a.includes("ลืมสแกน") && a.includes("2026-10-07 17:00") && a.includes("A01 สมชาย"));
});

test("PIN fallback: 4–8 digits, salted iterated hash, lockout after 5 misses", () => {
  assert.ok(C.validPin("1234") && C.validPin("12345678") && !C.validPin("123") && !C.validPin("12a4") && !C.validPin("123456789"));
  const h = C.pinHash("4321", "salt1");
  assert.equal(h.length, 64); assert.equal(h, C.pinHash("4321", "salt1")); assert.notEqual(h, C.pinHash("4321", "salt2")); assert.notEqual(h, C.pinHash("4322", "salt1"));
  const L = C.createLock({ max: 5, lockMs: 60000 });
  for (let i = 0; i < 4; i++) assert.equal(L.fail("A01", 1000), 0);
  assert.equal(L.fail("A01", 1000), 60000); assert.ok(L.locked("A01", 30000) > 0); assert.equal(L.locked("A01", 62000), 0); assert.equal(L.locked("B02", 1000), 0);
  L.fail("B02", 0); L.ok("B02"); assert.equal(L.locked("B02", 0), 0);
});

test("QR badge payload: round trip (Thai codes too), malformed or forged text rejected", () => {
  const tok = C.newToken(20);
  assert.match(tok, /^[A-Za-z0-9]{20}$/);
  assert.deepEqual(C.parseQr(C.qrPayload("A01", tok)), { code: "A01", token: tok });
  assert.deepEqual(C.parseQr(" " + C.qrPayload("พนง-001", tok) + "\n"), { code: "พนง-001", token: tok });
  for (const bad of ["", "A01", "LQAT1.A01", "LQAT1.A01.short", "LQAT2.A01." + tok, "LQAT1.%E0.%" + tok, "LQAT1." + encodeURIComponent("<b>") + "." + tok]) assert.equal(C.parseQr(bad), null, bad);
});

test("punch acceptance: repeat scans inside 60 s ignored; clock going backwards flagged; auto in/out meaning", () => {
  const ps = [P("a", "2026-11-09", "08:00")];
  assert.equal(C.acceptPunch(ps, "e1", T("2026-11-09", "08:00") + 30000).ok, false);
  assert.equal(C.acceptPunch(ps, "e1", T("2026-11-09", "08:01") + 1000).ok, true);
  assert.equal(C.acceptPunch(ps, "e2", T("2026-11-09", "08:00") + 1000).ok, true);
  assert.equal(C.acceptPunch(ps, "e2", T("2026-11-09", "07:00"), { dev: "dtest0001" }).clockBack, true);
  assert.equal(C.autoMeaning([], "e1", T("2026-11-09", "08:00"), DAY), "in");
  assert.equal(C.autoMeaning(ps, "e1", T("2026-11-09", "17:00"), DAY), "out");
  assert.equal(C.autoMeaning(ps, "e1", T("2026-11-10", "08:00"), DAY), "in");
  assert.equal(C.autoMeaning([P("n", "2026-11-09", "22:00")], "e1", T("2026-11-10", "06:00"), NIGHT), "out");
});

test("multi-device pack: strict allowlist, no secrets exported, merge dedupes and maps employees by code", () => {
  const emps = [{ id: "e1", code: "A01", name: "ก", dept: "x", shift: "day", pinHash: "h".repeat(64), pinSalt: "s", qr: "TOKEN1234567890" }];
  const pack = C.makePack({ dev: "dremote001", devName: "สาขา 2", punches: [P("r1", "2026-11-09", "08:00", "in", "pin", "eX")], audit: [], emps: [{ ...emps[0], id: "eX" }] }, 5);
  assert.ok(!/pinHash|pinSalt|TOKEN/.test(JSON.stringify(pack)));
  const ok = C.cleanPack(JSON.parse(JSON.stringify(pack)));
  assert.ok(ok.ok, ok.error);
  for (const mut of [p => { p.extra = 1; }, p => { p.punches[0].photo = "data:image/png;base64,AA"; }, p => { p.punches[0].type = "teleport"; }, p => { p.emps[0].descriptor = [1]; }, p => { p.format = "x"; }, p => { p.dev = "../etc"; }])
    { const x = JSON.parse(JSON.stringify(pack)); mut(x); assert.equal(C.cleanPack(x).ok, false); }
  const m = C.mergePacks({ punches: [P("l1", "2026-11-09", "07:00", "in", "face", "e1")], audit: [], emps }, [ok.pack, ok.pack]);
  assert.equal(m.added.punches, 1); assert.equal(m.punches.length, 2); assert.equal(m.emps.length, 1);
  assert.equal(m.punches.find(p => p.id === "r1").emp, "e1", "remote employee id mapped to the local one by code");
  const m2 = C.mergePacks({ punches: [], audit: [], emps: [] }, [ok.pack]);
  assert.equal(m2.added.emps, 1); assert.ok(m2.emps[0].imported);
  // audit entries travel with their hashes and still verify after the merge
  const log = [C.auditEntry([], { action: "punch_void", by: "boss", reason: "dup", target: "r1" }, "dremote001", 9)];
  const withAudit = C.cleanPack(JSON.parse(JSON.stringify(C.makePack({ dev: "dremote001", punches: [], audit: log, emps: [] }))));
  assert.ok(withAudit.ok); assert.ok(C.verifyAudit(C.mergePacks({ punches: [], audit: [], emps: [] }, [withAudit.pack]).audit).ok);
});

test("retention: time records >= 2 years (s.114), separate from face retention; purge drops only older records", () => {
  assert.equal(C.retentionYears(1), 2); assert.equal(C.retentionYears("5"), 5); assert.equal(C.retentionYears("x"), 2); assert.equal(C.retentionYears(99), 20);
  const now = Date.UTC(2026, 10, 8);
  assert.equal(new Date(C.retentionCutoff(0, now)).toISOString().slice(0, 10), "2024-11-08");
  const r = C.purge({ punches: [{ ts: Date.UTC(2024, 9, 1) }, { ts: Date.UTC(2025, 0, 1) }], audit: [{ at: Date.UTC(2024, 0, 1) }], leave: [{ date: "2024-01-02" }, { date: "2026-01-02" }] }, 2, now);
  assert.equal(r.removed, 3); assert.equal(r.punches.length, 1); assert.equal(r.leave.length, 1);
});

test("QR encoder: versions grow with length, finder patterns, deterministic matrix (decoded with OpenCV when written), limits", () => {
  const m = Q.matrix("LQAT1.A01.abcdefghijklmnopqrst");
  assert.equal(m.version, 3); assert.equal(m.size, 29);
  // finder pattern: dark 7x7 ring with a dark 3x3 centre at the three corners
  for (const [ox, oy] of [[0, 0], [m.size - 7, 0], [0, m.size - 7]]) {
    for (let i = 0; i < 7; i++) { assert.ok(m.get(ox + i, oy) && m.get(ox + i, oy + 6) && m.get(ox, oy + i) && m.get(ox + 6, oy + i)); }
    assert.ok(!m.get(ox + 1, oy + 1) && m.get(ox + 3, oy + 3));
  }
  assert.ok(m.get(8, m.size - 8), "dark module");
  let bits = ""; for (let y = 0; y < m.size; y++) for (let x = 0; x < m.size; x++) bits += m.get(x, y) ? 1 : 0;
  // matrix decoded back to the same text with cv2.QRCodeDetector when this encoder was written (v1, v3, v4, v6, v7, v8, v10)
  assert.equal(crypto.createHash("sha256").update(bits).digest("hex"), "f8f78b5074f32842c294c6ad994f8b614ecb7cddb9bf7148a8535a3e3cfe9ccc");
  assert.equal(Q.matrix("HELLO").version, 1); assert.equal(Q.matrix("x".repeat(150)).version, 8); assert.equal(Q.matrix("w".repeat(200)).version, 10);
  assert.throws(() => Q.matrix("x".repeat(300)), /too long/);
  const svg = Q.svg("LQAT1.A01.abcdefghijklmnopqrst", { label: "QR <A01>" });
  assert.ok(svg.startsWith("<svg") && svg.includes('viewBox="0 0 37 37"') && svg.includes("QR &lt;A01&gt;") && !svg.includes("<A01>"));
});

test("attendance-hr.js: every text key has an English and a Chinese entry with the same placeholders", () => {
  const src = fs.readFileSync(path.join(ROOT, "attendance-hr.js"), "utf8");
  const calls = [...src.matchAll(/\bT\("([^"]+)",\s*"((?:[^"\\]|\\.)*)"/g)].map(m => ({ key: "attendance.hr." + m[1], th: m[2] }));
  assert.ok(calls.length > 150, "found " + calls.length);
  const dict = lang => { const w = {}; w.window = w; vm.runInNewContext(fs.readFileSync(path.join(ROOT, "i18n", `${lang}-attendance.js`), "utf8"), w); return Object.assign({}, ...w.LQI18N_Q.map(d => d[lang])); };
  for (const lang of ["en", "zh"]) {
    const d = dict(lang), miss = [], ph = [];
    for (const c of calls) {
      if (typeof d[c.key] !== "string") { miss.push(c.key); continue; }
      for (const p of c.th.match(/\{\w+\}/g) || []) if (!d[c.key].includes(p)) ph.push(c.key + " " + p);
      assert.ok(!/[ก-๛]/.test(d[c.key]), `${lang} ${c.key} has Thai`);
    }
    assert.deepEqual(miss, [], lang + " missing"); assert.deepEqual(ph, [], lang + " placeholders");
  }
  // the same key is never used with two different Thai defaults
  const seen = new Map();
  for (const c of calls) { if (seen.has(c.key)) assert.equal(seen.get(c.key), c.th, c.key); seen.set(c.key, c.th); }
});

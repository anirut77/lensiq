#!/usr/bin/env node
// tools/attendance-time-hand.mjs — writes hand.json of the FIXED Attendance A1 set: 5 staff-months whose expected numbers
// were worked out BY HAND from the rules (the working is in the comments) and typed in here as literals. Nothing in this
// file computes an expected value; it only turns "2026-02-02 08:03" into epoch ms (UTC+7). Source class: SYNTHETIC.
//   node tools/attendance-time-hand.mjs [--out <dir>]   default: the attendance-time phase folder; refuses to overwrite
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { phaseDir } from "./eval-guard.mjs";

/** "YYYY-MM-DD HH:MM" Bangkok time -> epoch ms */
const T = s => { const [d, t] = s.split(" "), [y, m, dd] = d.split("-").map(Number), [h, mi] = t.split(":").map(Number); return Date.UTC(y, m - 1, dd, h, mi) - 7 * 3600000; };
let n = 0;
const P = (emp, s, type, method) => ({ id: "h" + (++n), emp, ts: T(s), type, method, dev: "dhand0001" });
const NOW = Date.UTC(2030, 0, 1);
const ZERO = { sick: 0, personal: 0, annual: 0, maternity: 0, other: 0 };
const NOMETH = { face: 0, pin: 0, qr: 0, manual: 0 };

// ---- case H-FEB: 2026-02 (1 Feb = Sunday), no holidays; two staff
// h1: shift "day" = 08:00–17:00 from the defaults (grace 5, OT from 30 min rounded down to 15, break 60, Mon–Fri)
//   Feb 2  08:03–17:10  late 3 <= 5 -> 0; 10 min after the end < 30 -> OT 0; span 547 - 60 = 487
//   Feb 3  08:20–17:00  late 20; span 520 - 60 = 460
//   Feb 4  08:00–18:40  OT 100 -> 90; span 640 - 60 = 580
//   Feb 5  08:00–16:30  early 30; span 510 - 60 = 450
//   Feb 7  (Sat, rest day) 09:00–15:00  span 360 > 300 -> 300 worked; holiday hours 300 (<= 480 normal), holiday OT 0
//   every other weekday absent: 20 weekdays - 4 = 16
//   weeks: Feb 2 week OT 90; normal 487 + 460 + (580 - 90) + 450 = 1887
// h2: shift "n" = Night 22:00–06:00, grace 5, OT 30/15, break 60, Mon–Fri
//   Jan 30 (previous month) 22:00 -> Jan 31 06:00: belongs to Jan 30, not in February; its week (Jan 26) normal 420
//   Feb 2  21:50 -> Feb 3 06:05  late 0; OT 5 -> 0; span 495 - 60 = 435
//   Feb 3  22:00 -> Feb 4 06:00 with a 45-min break 01:00–01:45: 480 - 45 = 435
//   Feb 27 22:10 -> Feb 28 07:00  late 10; OT 60; span 530 - 60 = 470 (belongs to Feb 27)
//   absent 20 - 3 = 17; weeks: Feb 2 week normal 870; Feb 23 week normal 470 - 60 = 410, OT 60
const feb = {
  id: "hand-2026-02", month: "2026-02", now: NOW, substitute: true, holidays: [],
  shifts: [{ id: "day", start: "08:00", end: "17:00" }, { id: "n", name: "Night", start: "22:00", end: "06:00", breakMin: 60, graceLate: 5, otMinMin: 30, otRound: 15, days: [1, 2, 3, 4, 5] }],
  emps: [{ id: "h1", code: "H01", name: "Hand day", dept: "Shop", shift: "day" }, { id: "h2", code: "H02", name: "Hand night", dept: "Security", shift: "n" }],
  punches: [
    P("h1", "2026-02-02 08:03", "auto", "pin"), P("h1", "2026-02-02 17:10", "auto", "pin"), P("h1", "2026-02-03 08:20", "auto", "pin"), P("h1", "2026-02-03 17:00", "auto", "pin"),
    P("h1", "2026-02-04 08:00", "auto", "pin"), P("h1", "2026-02-04 18:40", "auto", "pin"), P("h1", "2026-02-05 08:00", "auto", "pin"), P("h1", "2026-02-05 16:30", "auto", "pin"),
    P("h1", "2026-02-07 09:00", "auto", "pin"), P("h1", "2026-02-07 15:00", "auto", "pin"),
    P("h2", "2026-01-30 22:00", "in", "qr"), P("h2", "2026-01-31 06:00", "out", "qr"),
    P("h2", "2026-02-02 21:50", "in", "qr"), P("h2", "2026-02-03 06:05", "out", "qr"),
    P("h2", "2026-02-03 22:00", "in", "qr"), P("h2", "2026-02-04 01:00", "break_out", "qr"), P("h2", "2026-02-04 01:45", "break_in", "qr"), P("h2", "2026-02-04 06:00", "out", "qr"),
    P("h2", "2026-02-27 22:10", "in", "qr"), P("h2", "2026-02-28 07:00", "out", "qr")
  ],
  audit: [], leave: [], tags: { h1: ["hand", "late", "early", "ot", "rest-day-work"], h2: ["hand", "night-shift", "break", "weeks-across-months", "night-across-month-end"] }
};
const febExp = {
  h1: { scheduled: 20, daysWorked: 5, lateCount: 1, lateMin: 20, earlyCount: 1, earlyMin: 30, otMin: 90, otPendingMin: 0, holidayDays: 1, holidayMin: 300, holidayOtMin: 0,
    leave: ZERO, leaveDays: 0, absentDays: 16, incompleteDays: 0, corrections: 0, workedMin: 2277, methods: { ...NOMETH, pin: 10 },
    maxWeekOtMin: 90, weekOtOver: [], maxWeekNormalMin: 1887, weekNormalOver: [], shift: "08:00–17:00",
    csv: ["2026-02", "H01", "Hand day", "Shop", "08:00–17:00", "20", "5", "1", "20", "1", "30", "1.50", "0.00", "1", "5.00", "0.00", "0", "0", "0", "0", "0", "0", "16", "0", "0", "1.50", "", "31.45", ""] },
  h2: { scheduled: 20, daysWorked: 3, lateCount: 1, lateMin: 10, earlyCount: 0, earlyMin: 0, otMin: 60, otPendingMin: 0, holidayDays: 0, holidayMin: 0, holidayOtMin: 0,
    leave: ZERO, leaveDays: 0, absentDays: 17, incompleteDays: 0, corrections: 0, workedMin: 1340, methods: { ...NOMETH, qr: 8 },
    maxWeekOtMin: 60, weekOtOver: [], maxWeekNormalMin: 870, weekNormalOver: [], shift: "Night",
    csv: ["2026-02", "H02", "Hand night", "Security", "Night", "20", "3", "1", "10", "0", "0", "1.00", "0.00", "0", "0.00", "0.00", "0", "0", "0", "0", "0", "0", "17", "0", "0", "1.00", "", "14.50", ""] }
};

// ---- case H-APR: 2026-04 (1 Apr = Wednesday); holidays Apr 6, 13, 14, 15 (all weekdays) -> 22 weekdays - 4 = 18 scheduled
// h3: shift "da" = 08:00–17:00 with OT approval (grace 5, OT 30/15, break 60, Mon–Fri)
//   Apr 1  08:00–19:00  OT 120, approved -> OT 120; span 660 - 60 = 600; normal 600 - 120 = 480
//   Apr 2  08:00–18:00  OT 60, NOT approved -> pending 60; worked 540; normal 480
//   Apr 3  08:02 only, manager adds 17:00 (manual)  late 2 -> 0; 538 - 60 = 478; correction 1; manual 1
//   Apr 6  holiday, sick leave entered -> ignored (not a working day)
//   Apr 7  sick leave (full)
//   Apr 8  personal leave half day, works 13:00–17:00  span 240 <= 300 -> 240 worked, no late (half leave)
//   Apr 9  annual leave half day, no punches -> absent 0.5
//   Apr 10 08:30 edited to 08:00 by the manager, out 17:00 -> late 0, 480 worked; correction 1
//   Apr 13 holiday, works 08:00–20:00  660 worked: 480 holiday hours + otRule(180) = 180 holiday OT
//   Apr 16 08:00–17:00 plus a stray 23:00 scan that is voided -> 480 worked
//   absent: Apr 17, 20–24, 27–30 = 10, plus Apr 9 half = 10.5
//   weeks: Mar 30 week OT 120, normal 480 + 480 + 478 = 1438; Apr 6 week normal 720; Apr 13 week OT 180 (holiday OT), normal 480
const apr = {
  id: "hand-2026-04", month: "2026-04", now: NOW, substitute: true,
  holidays: [{ date: "2026-04-06", key: "chakri" }, { date: "2026-04-13", key: "songkran" }, { date: "2026-04-14", key: "songkran" }, { date: "2026-04-15", key: "songkran" }],
  shifts: [{ id: "da", name: "Day approval", start: "08:00", end: "17:00", breakMin: 60, graceLate: 5, otMinMin: 30, otRound: 15, otApproval: true, days: [1, 2, 3, 4, 5] }],
  emps: [{ id: "h3", code: "H03", name: "Hand approvals", dept: "Office", shift: "da" }],
  punches: [], audit: [], leave: [], tags: { h3: ["hand", "ot-approval", "corr-add", "corr-edit", "corr-void", "leave", "leave-half", "leave-on-holiday", "holiday-work", "holiday-ot"] }
};
{
  const p = (s, type = "auto") => { const x = P("h3", s, type, "pin"); apr.punches.push(x); return x; };
  p("2026-04-01 08:00"); p("2026-04-01 19:00"); p("2026-04-02 08:00"); p("2026-04-02 18:00"); p("2026-04-03 08:02");
  p("2026-04-08 13:00"); p("2026-04-08 17:00");
  const late = p("2026-04-10 08:30"); p("2026-04-10 17:00");
  p("2026-04-13 08:00"); p("2026-04-13 20:00");
  p("2026-04-16 08:00"); p("2026-04-16 17:00"); const stray = p("2026-04-16 23:00");
  const A = (i, s, e) => apr.audit.push(Object.assign({ id: "ha" + i, at: T(s), dev: "dhand0001", seq: i, by: "Manager", emp: "h3", before: null, reason: "hand case" }, e));
  A(1, "2026-04-01 20:00", { action: "ot_approve", target: "h3|2026-04-01", after: { approved: true } });
  A(2, "2026-04-03 18:00", { action: "punch_add", after: { id: "hm1", emp: "h3", ts: T("2026-04-03 17:00"), type: "out", dev: "dhand0001" } });
  A(3, "2026-04-10 18:00", { action: "punch_edit", target: late.id, before: { ts: late.ts }, after: { ts: T("2026-04-10 08:00") } });
  A(4, "2026-04-17 09:00", { action: "punch_void", target: stray.id, before: { ts: stray.ts }, after: null });
  apr.leave.push({ emp: "h3", date: "2026-04-06", type: "sick" }, { emp: "h3", date: "2026-04-07", type: "sick" },
    { emp: "h3", date: "2026-04-08", type: "personal", part: 0.5 }, { emp: "h3", date: "2026-04-09", type: "annual", part: 0.5 });
}
const aprExp = {
  h3: { scheduled: 18, daysWorked: 7, lateCount: 0, lateMin: 0, earlyCount: 0, earlyMin: 0, otMin: 120, otPendingMin: 60, holidayDays: 1, holidayMin: 480, holidayOtMin: 180,
    leave: { ...ZERO, sick: 1, personal: 0.5, annual: 0.5 }, leaveDays: 2, absentDays: 10.5, incompleteDays: 0, corrections: 2, workedMin: 3478, methods: { ...NOMETH, pin: 13, manual: 1 },
    maxWeekOtMin: 180, weekOtOver: [], maxWeekNormalMin: 1438, weekNormalOver: [], shift: "Day approval",
    csv: ["2026-04", "H03", "Hand approvals", "Office", "Day approval", "18", "7", "0", "0", "0", "0", "2.00", "1.00", "1", "8.00", "3.00", "1", "0.5", "0.5", "0", "0", "2", "10.5", "0", "2", "3.00", "", "23.97", ""] }
};

// ---- cases H-DEC (substitution on) and H-DEC-NOSUB (off): 2026-12 (1 Dec = Tuesday); holidays Dec 5 (Sat), Dec 10, Dec 31
// h4 / h5: shift "day" from the defaults (Mon–Fri). With substitution, Dec 5 (a rest day) moves to Mon Dec 7.
//   Dec 1  08:00–17:20  20 min < 30 -> OT 0; 560 - 60 = 500
//   Dec 7  08:00–17:00  substitution ON: holiday work 480 (holiday hours 480, OT 0); OFF: a normal day, 480 worked
//   Dec 31 08:00–18:00  holiday work: 540 worked = 480 holiday hours + otRule(60) = 60 holiday OT
//   weekdays 23; ON: holidays on weekdays 7, 10, 31 -> 20 scheduled, absent 20 - 1 = 19; OFF: 10, 31 -> 21 scheduled, absent 21 - 2 = 19
//   weeks: Nov 30 week normal 500; Dec 28 week holiday OT 60; OFF also Dec 7 week normal 480
const decCase = (id, sub, emp) => {
  const c = { id, month: "2026-12", now: NOW, substitute: sub, holidays: [{ date: "2026-12-05", key: "father" }, { date: "2026-12-10", key: "constitution" }, { date: "2026-12-31", key: "nye" }],
    shifts: [{ id: "day", start: "08:00", end: "17:00" }], emps: [{ id: emp, code: emp.toUpperCase(), name: "Hand December", dept: "Shop", shift: "day" }],
    punches: [P(emp, "2026-12-01 08:00", "auto", "pin"), P(emp, "2026-12-01 17:20", "auto", "pin"), P(emp, "2026-12-07 08:00", "auto", "pin"), P(emp, "2026-12-07 17:00", "auto", "pin"),
      P(emp, "2026-12-31 08:00", "auto", "pin"), P(emp, "2026-12-31 18:00", "auto", "pin")],
    audit: [], leave: [], tags: { [emp]: ["hand", sub ? "substitution" : "no-substitution", "holiday-work", "holiday-ot"] } };
  return c;
};
const dec = decCase("hand-2026-12", true, "h4"), decOff = decCase("hand-2026-12-nosub", false, "h5");
const decExp = {
  h4: { scheduled: 20, daysWorked: 3, lateCount: 0, lateMin: 0, earlyCount: 0, earlyMin: 0, otMin: 0, otPendingMin: 0, holidayDays: 2, holidayMin: 960, holidayOtMin: 60,
    leave: ZERO, leaveDays: 0, absentDays: 19, incompleteDays: 0, corrections: 0, workedMin: 1520, methods: { ...NOMETH, pin: 6 },
    maxWeekOtMin: 60, weekOtOver: [], maxWeekNormalMin: 500, weekNormalOver: [], shift: "08:00–17:00",
    csv: ["2026-12", "H4", "Hand December", "Shop", "08:00–17:00", "20", "3", "0", "0", "0", "0", "0.00", "0.00", "2", "16.00", "1.00", "0", "0", "0", "0", "0", "0", "19", "0", "0", "1.00", "", "8.33", ""] }
};
const decOffExp = {
  h5: { scheduled: 21, daysWorked: 3, lateCount: 0, lateMin: 0, earlyCount: 0, earlyMin: 0, otMin: 0, otPendingMin: 0, holidayDays: 1, holidayMin: 480, holidayOtMin: 60,
    leave: ZERO, leaveDays: 0, absentDays: 19, incompleteDays: 0, corrections: 0, workedMin: 1520, methods: { ...NOMETH, pin: 6 },
    maxWeekOtMin: 60, weekOtOver: [], maxWeekNormalMin: 500, weekNormalOver: [], shift: "08:00–17:00",
    csv: ["2026-12", "H5", "Hand December", "Shop", "08:00–17:00", "21", "3", "0", "0", "0", "0", "0.00", "0.00", "1", "8.00", "1.00", "0", "0", "0", "0", "0", "0", "19", "0", "0", "1.00", "", "8.33", ""] }
};

const argv = process.argv.slice(2), oi = argv.indexOf("--out");
const dir = oi >= 0 ? argv[oi + 1] : phaseDir("attendance-time");
const file = join(dir, "hand.json");
if (existsSync(file)) { console.error("attendance-time-hand: refusing to overwrite " + file); process.exit(1); }
mkdirSync(dir, { recursive: true });
const cases = [feb, apr, dec, decOff];
writeFileSync(file, JSON.stringify({ about: "LENSIQ Attendance A1: staff-months worked out by hand (tools/attendance-time-hand.mjs comments)", staffMonths: 5, cases,
  expected: { [feb.id]: febExp, [apr.id]: aprExp, [dec.id]: decExp, [decOff.id]: decOffExp } }, null, 1) + "\n");
console.log("wrote 5 hand-worked staff-months to " + file);

#!/usr/bin/env node
// tools/attendance-time-set.mjs — builds the FIXED Attendance A1 time-maths set (acceptance sheet docs/acceptance/attendance.md,
// criterion A1: "100 % of hours, OT, night-shift and holiday totals equal the hand-worked answer, on >= 60 synthetic
// staff-months covering every rule"). Source class: SYNTHETIC (no person, no real payroll).
//
// Independence: this file never loads lensiq-timeclock.js (or any page code). Every day is built from chosen parameters
// (arrive a minutes after the shift start, leave b minutes after the shift end, a break of L minutes, ...) and its expected
// numbers are worked out from those parameters with the rules as written for the owner (docs/ATTENDANCE-READINESS.md and
// the rule comment above daySummary / monthSummary):
//   late      counted in full from the shift start once it is over the grace minutes (within grace = on time)
//   early     the same for leaving before the shift end (graceEarly)
//   OT        from the shift end + otStartAfter; nothing below otMinMin; rounded DOWN to otRound; with otApproval the
//             minutes wait (ot_pending) until a manager approves that employee-day (an approval can be withdrawn)
//   breaks    break_out -> break_in pairs are deducted; an open break runs to the clock-out; with no recorded break the
//             shift's unpaid break is deducted only when the span is over 5 h
//   holidays  Thai public holidays + company days; one on a weekly rest day moves to the next working day that is not a
//             holiday (substitution, can be switched off); work on a holiday / rest day = holiday hours up to the shift's
//             normal hours, the rest is holiday OT (same OT rule)
//   leave     full / half day; half-day leave cancels late and early; leave on a holiday or rest day does not count; a
//             removed entry does not count; a later entry for the same day wins; an unknown type counts as "other"
//   night     a shift that ends after midnight belongs to its start date (also across a month end)
//   history   a shift change from a date does not rewrite earlier days
//   weeks     OT + holiday OT > 36 h in a Monday–Sunday week and normal hours > 48 h are flagged; whole weeks count, also
//             the days of the previous / next month
//   corrections  added punches (manual), edited punches, voided punches from the audit log; raw punches stay
//   payroll   one CSV row per employee, hours with 2 decimals
// A second file, hand.json, holds a few staff-months whose expected numbers were written out by hand (not by this code).
//
//   node tools/attendance-time-set.mjs [--out <dir>]   default: the attendance-time phase folder; refuses to overwrite
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { phaseDir } from "./eval-guard.mjs";

const MIN = 60000, TZ = 420, YEAR = 2026;
const pad = n => String(n).padStart(2, "0");
const ymd = (y, m, d) => { const t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCFullYear() + "-" + pad(t.getUTCMonth() + 1) + "-" + pad(t.getUTCDate()); };
const parts = s => s.split("-").map(Number);
const plus = (date, n) => { const [y, m, d] = parts(date); return ymd(y, m, d + n); };
const dow = date => { const [y, m, d] = parts(date); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
const monday = date => plus(date, -((dow(date) + 6) % 7));
const daysOf = month => { const [y, m] = parts(month); const n = new Date(Date.UTC(y, m, 0)).getUTCDate(); return Array.from({ length: n }, (_, i) => month + "-" + pad(i + 1)); };
const mins = hhmm => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
/** local (UTC+7) date + minutes after its midnight (may be > 1440) -> epoch ms */
const at = (date, m) => { const [y, mo, d] = parts(date); return Date.UTC(y, mo - 1, d) - TZ * MIN + m * MIN; };
const hours = m => (Math.round(m / 60 * 100) / 100).toFixed(2);

// ---------------------------------------------------------------- deterministic random
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------------------------------------------------------------- shifts (as stored by the page)
const DEF = { breakMin: 60, graceLate: 5, graceEarly: 0, otMinMin: 30, otRound: 15, otStartAfter: 0, otApproval: false, days: [1, 2, 3, 4, 5] };
const SHIFTS = [
  { id: "day", start: "08:00", end: "17:00" }, // every rule value from the defaults
  { id: "day9", name: "Office 9-18", start: "09:00", end: "18:00", breakMin: 60, graceLate: 10, graceEarly: 5, otMinMin: 60, otRound: 30, otStartAfter: 30, days: [1, 2, 3, 4, 5] },
  { id: "night", name: "Night 22-06", start: "22:00", end: "06:00", breakMin: 60, graceLate: 5, graceEarly: 0, otMinMin: 30, otRound: 15, otStartAfter: 0, days: [1, 2, 3, 4, 5] },
  { id: "night8", name: "Night 20-05 approval", start: "20:00", end: "05:00", breakMin: 60, graceLate: 0, graceEarly: 10, otMinMin: 15, otRound: 15, otStartAfter: 0, otApproval: true, days: [0, 1, 2, 3, 4] },
  { id: "six", name: "Six-day 08-17", start: "08:00", end: "17:00", breakMin: 60, graceLate: 5, graceEarly: 0, otMinMin: 30, otRound: 15, otStartAfter: 0, days: [1, 2, 3, 4, 5, 6] },
  { id: "eve", name: "Evening 14-23 approval", start: "14:00", end: "23:00", breakMin: 45, graceLate: 3, graceEarly: 0, otMinMin: 20, otRound: 10, otStartAfter: 0, otApproval: true, days: [2, 3, 4, 5, 6] },
  { id: "half", name: "Morning 08-12:30", start: "08:00", end: "12:30", breakMin: 30, graceLate: 5, graceEarly: 0, otMinMin: 30, otRound: 15, otStartAfter: 0, days: [1, 2, 3, 4, 5, 6] }
];
const full = s => Object.assign({}, DEF, { name: s.start + "–" + s.end }, s);
const SH = Object.fromEntries(SHIFTS.map(s => [s.id, full(s)]));
const spanOf = s => { const d = (mins(s.end) - mins(s.start) + 1440) % 1440; return d || 1440; };
const normalOf = s => Math.max(0, spanOf(s) - s.breakMin);
const otRule = (m, s) => { const x = m - s.otStartAfter; return x >= s.otMinMin && x > 0 ? Math.floor(x / s.otRound) * s.otRound : 0; };
/** smallest minutes after the end that earn OT */
const otFrom = s => s.otStartAfter + Math.max(s.otMinMin, 1);

// ---------------------------------------------------------------- holidays (public calendar, 2026 + the edges)
const FIXED = [["01-01", "newyear"], ["04-06", "chakri"], ["04-13", "songkran"], ["04-14", "songkran"], ["04-15", "songkran"], ["05-01", "labour"], ["05-04", "coronation"],
  ["06-03", "queen"], ["07-28", "king"], ["08-12", "mother"], ["10-13", "rama9"], ["10-23", "chula"], ["12-05", "father"], ["12-10", "constitution"], ["12-31", "nye"]];
const HOLIDAYS = [{ date: "2025-12-05", key: "father" }, { date: "2025-12-10", key: "constitution" }, { date: "2025-12-31", key: "nye" },
  ...FIXED.map(([md, key]) => ({ date: YEAR + "-" + md, key })), { date: "2026-03-03", key: "makha" }, { date: "2026-05-31", key: "visakha" }, { date: "2026-07-29", key: "asalha" },
  { date: "2027-01-01", key: "newyear" }].sort((a, b) => a.date.localeCompare(b.date));
// company days added in some months (the page lets the owner add / edit days)
const COMPANY = { "2026-02": [{ date: "2026-02-16", name: "Company day" }], "2026-09": [{ date: "2026-09-12", name: "Company outing (Sat)" }], "2026-11": [{ date: "2026-11-23", name: "Loy Krathong (company)" }] };
// months whose report is built with substitution switched off
const NO_SUB = new Set(["2026-06"]);

/** holiday dates for one shift's working days: the s.29 substitution walked forward, at most 14 days */
function holidaySet(list, workdays, substitute) {
  const m = new Map(), days = new Set(workdays.length ? workdays : [1, 2, 3, 4, 5]);
  const sorted = list.slice().sort((a, b) => a.date.localeCompare(b.date));
  for (const h of sorted) m.set(h.date, h);
  if (substitute) for (const h of sorted) {
    if (days.has(dow(h.date))) continue;
    let d = plus(h.date, 1), n = 0;
    while ((!days.has(dow(d)) || m.has(d)) && n++ < 14) d = plus(d, 1);
    if (n < 14) m.set(d, { date: d, sub: h.date });
  }
  return m;
}

// ---------------------------------------------------------------- one day, worked out from its parameters
/** an empty expected day */
const blank = (date, kind) => ({ date, kind, status: kind, workedMin: 0, lateMin: 0, earlyMin: 0, otMin: 0, otRaw: 0, pending: false, holidayMin: 0, holidayOtMin: 0, leave: null, corrected: 0 });
let pid = 0;
const P = (emp, ts, type, method) => ({ id: "p" + (++pid).toString(36), emp, ts, type, method, dev: "dset00001" });

/**
 * Builds one employee-day. ctx = {emp, shift, date, kind, r, method(), leaveFor(part, type), audit(entry)}.
 * Returns {punches, day (expected), tag}. Times: S = shift start (minutes after the date's midnight), E = S + span.
 */
function workDay(ctx, ev) {
  const { emp, shift: s, date, r } = ctx, S = mins(s.start), span = spanOf(s), E = S + span, d = blank(date, "work");
  const m = () => ctx.method();
  const span2 = (a, b) => span - a + b;
  const deductNoBreak = sp => (sp > 300 ? Math.min(s.breakMin, sp) : 0);
  const finish = (a, b, opts = {}) => { // in at S + a, out at E + b, no recorded break, full day of work
    const sp = span2(a, b), brk = opts.brk || 0;
    d.status = "present";
    d.workedMin = Math.max(0, sp - (brk > 0 ? brk : deductNoBreak(sp)));
    if (!opts.half) { d.lateMin = a > s.graceLate ? a : 0; d.earlyMin = -b > s.graceEarly ? -b : 0; }
    d.otRaw = otRule(b, s);
    return d;
  };
  const ontimeA = () => Math.floor(r() * (25 + s.graceLate + 1)) - 25; // -25 .. grace
  const noOtB = () => Math.floor(r() * Math.min(otFrom(s), 41)); // 0 .. below the OT threshold (at most 40)
  const ps = [];
  switch (ev) {
    case "ontime": { const a = ontimeA(), b = noOtB(); ps.push(P(emp, at(date, S + a), "auto", m()), P(emp, at(date, E + b), "auto", m())); finish(a, b); break; }
    case "grace-edge": { const a = s.graceLate, b = otFrom(s) - 1; ps.push(P(emp, at(date, S + a), "in", m()), P(emp, at(date, E + b), "out", m())); finish(a, b); break; }
    case "late-edge": { const a = s.graceLate + 1, b = noOtB(); ps.push(P(emp, at(date, S + a), "auto", m()), P(emp, at(date, E + b), "auto", m())); finish(a, b); break; }
    case "late": { const a = s.graceLate + 1 + Math.floor(r() * 90), b = noOtB(); ps.push(P(emp, at(date, S + a), "auto", m()), P(emp, at(date, E + b), "auto", m())); finish(a, b); break; }
    case "early": { const a = ontimeA(), b = -(1 + Math.floor(r() * 120)); ps.push(P(emp, at(date, S + a), "auto", m()), P(emp, at(date, E + b), "auto", m())); finish(a, b); break; }
    case "early-grace": { const a = 0, b = -s.graceEarly; ps.push(P(emp, at(date, S + a), "auto", m()), P(emp, at(date, E + b), "auto", m())); finish(a, b); break; }
    case "ot-edge": { const a = ontimeA(), b = otFrom(s); ps.push(P(emp, at(date, S + a), "auto", m()), P(emp, at(date, E + b), "auto", m())); finish(a, b); break; }
    case "ot": { const a = ontimeA(), b = otFrom(s) + Math.floor(r() * 200); ps.push(P(emp, at(date, S + a), "auto", m()), P(emp, at(date, E + b), "auto", m())); finish(a, b); break; }
    case "ot-heavy": { const a = 0, b = 420; ps.push(P(emp, at(date, S + a), "in", m()), P(emp, at(date, E + b), "out", m())); finish(a, b); break; }
    case "long-normal": { const a = 0, b = 20; ps.push(P(emp, at(date, S + a), "in", m()), P(emp, at(date, E + b), "out", m())); finish(a, b); break; }
    case "late-ot": { const a = s.graceLate + 5 + Math.floor(r() * 30), b = otFrom(s) + Math.floor(r() * 90); ps.push(P(emp, at(date, S + a), "auto", m()), P(emp, at(date, E + b), "auto", m())); finish(a, b); break; }
    case "break": case "long-break": {
      const a = ontimeA(), b = noOtB(), L = ev === "long-break" ? s.breakMin + 1 + Math.floor(r() * 40) : 15 + Math.floor(r() * Math.max(1, s.breakMin - 14)), bo = S + Math.floor(span / 2) - 30;
      ps.push(P(emp, at(date, S + a), "in", m()), P(emp, at(date, bo), "break_out", m()), P(emp, at(date, bo + L), "break_in", m()), P(emp, at(date, E + b), "out", m()));
      finish(a, b, { brk: L }); break;
    }
    case "two-breaks": {
      const a = ontimeA(), b = noOtB(), L1 = 15 + Math.floor(r() * 20), L2 = 10 + Math.floor(r() * 20), b1 = S + Math.floor(span / 4), b2 = S + Math.floor(span * 0.6);
      ps.push(P(emp, at(date, S + a), "in", m()), P(emp, at(date, b1), "break_out", m()), P(emp, at(date, b1 + L1), "break_in", m()),
        P(emp, at(date, b2), "break_out", m()), P(emp, at(date, b2 + L2), "break_in", m()), P(emp, at(date, E + b), "out", m()));
      finish(a, b, { brk: L1 + L2 }); break;
    }
    case "open-break": { // break_out with no break_in: the break runs to the clock-out
      const a = ontimeA(), b = noOtB(), bo = E - 90 - Math.floor(r() * 60);
      ps.push(P(emp, at(date, S + a), "in", m()), P(emp, at(date, bo), "break_out", m()), P(emp, at(date, E + b), "out", m()));
      finish(a, b, { brk: E + b - bo }); break;
    }
    case "short-day": { // span <= 5 h: no break deducted
      const a = ontimeA(), dur = Math.min(300, span - a - 1) - Math.floor(r() * 60), b = a + dur - span;
      ps.push(P(emp, at(date, S + a), "auto", m()), P(emp, at(date, S + a + dur), "auto", m())); finish(a, b); break;
    }
    case "dup-scan": { // repeated scans between in and out change nothing
      const a = ontimeA(), b = noOtB();
      ps.push(P(emp, at(date, S + a), "auto", m()), P(emp, at(date, S + a + 2), "auto", m()), P(emp, at(date, S + 200), "auto", m()), P(emp, at(date, E + b), "auto", m())); finish(a, b); break;
    }
    case "explicit-wins": { // an earlier auto scan, then an explicit "in" that is late; an explicit "out", then a later auto scan
      const a = s.graceLate + 10 + Math.floor(r() * 20), b = -(s.graceEarly + 5 + Math.floor(r() * 20));
      ps.push(P(emp, at(date, S - 20), "auto", m()), P(emp, at(date, S + a), "in", m()), P(emp, at(date, E + b), "out", m()), P(emp, at(date, E + 60), "auto", m()));
      finish(a, b); break;
    }
    case "missing-out": { const a = s.graceLate + Math.floor(r() * 30) - 10; ps.push(P(emp, at(date, S + a), "auto", m())); d.status = "incomplete"; d.lateMin = a > s.graceLate ? a : 0; break; }
    case "missing-in": { ps.push(P(emp, at(date, S + 200), "break_out", m()), P(emp, at(date, E), "out", m())); d.status = "incomplete"; break; }
    case "absent": d.status = "absent"; break;
    case "leave-full": { const t = ctx.leaveFor(1); d.status = "leave"; d.leave = { type: t, part: 1 }; break; }
    case "leave-removed": { ctx.leaveFor(1, "sick", true); d.status = "absent"; break; } // a removed entry does not count
    case "leave-half-am": { // morning off, works the afternoon: no late, no early; OT still counts
      const t = ctx.leaveFor(0.5), a = Math.floor(span / 2) + Math.floor(r() * 40), b = Math.floor(r() * (otFrom(s) + 60)) - 30;
      ps.push(P(emp, at(date, S + a), "auto", m()), P(emp, at(date, E + b), "auto", m())); finish(a, b, { half: true }); d.leave = { type: t, part: 0.5 }; break;
    }
    case "leave-half-pm": { const t = ctx.leaveFor(0.5), a = ontimeA() + 10, b = -Math.floor(span / 2); ps.push(P(emp, at(date, S + a), "auto", m()), P(emp, at(date, E + b), "auto", m())); finish(a, b, { half: true }); d.leave = { type: t, part: 0.5 }; break; }
    case "leave-half-absent": { const t = ctx.leaveFor(0.5); d.status = "absent"; d.leave = { type: t, part: 0.5 }; break; }
    case "corr-add": { // forgot to clock out: the manager adds the out punch
      const a = ontimeA(), b = noOtB(); ps.push(P(emp, at(date, S + a), "auto", m()));
      ctx.audit({ action: "punch_add", emp, after: { id: "m" + (++pid).toString(36), emp, ts: at(date, E + b), type: "out", dev: "dset00001" }, reason: "forgot to clock out" });
      finish(a, b); d.corrected = 1; d.manual = 1; break;
    }
    case "corr-edit": { // a wrong in time (very late) is edited to the real arrival
      const real = ontimeA(), b = noOtB(), p = P(emp, at(date, S + 70), "auto", m()); ps.push(p, P(emp, at(date, E + b), "auto", m()));
      ctx.audit({ action: "punch_edit", emp, target: p.id, before: { ts: p.ts }, after: { ts: at(date, S + real) }, reason: "scanner clock" });
      finish(real, b); d.corrected = 1; break;
    }
    case "corr-void": { // a stray scan late at night is voided: the real out is the earlier one
      const a = ontimeA(), b = noOtB(), stray = P(emp, at(date, E + 200), "auto", m()); ps.push(P(emp, at(date, S + a), "auto", m()), P(emp, at(date, E + b), "auto", m()), stray);
      ctx.audit({ action: "punch_void", emp, target: stray.id, before: { ts: stray.ts }, after: null, reason: "someone else's card" }); ctx.voided.add(stray.id);
      finish(a, b); break;
    }
    default: throw new Error("unknown work event " + ev);
  }
  return { punches: ps, day: d };
}
function offDay(ctx, ev, kind) {
  const { emp, shift: s, date, r } = ctx, S = mins(s.start), span = spanOf(s), E = S + span, d = blank(date, kind), ps = [];
  if (ev === "hwork" || ev === "hwork-ot" || ev === "hwork-short") {
    const a = Math.floor(r() * 30) - 10, b = ev === "hwork-ot" ? 30 + Math.floor(r() * 240) : ev === "hwork-short" ? -(span - 200) : -Math.floor(r() * 60);
    const sp = span - a + b, brk = sp > 300 ? Math.min(s.breakMin, sp) : 0, worked = Math.max(0, sp - brk), normal = normalOf(s);
    ps.push(P(emp, at(date, S + a), "auto", ctx.method()), P(emp, at(date, E + b), "auto", ctx.method()));
    Object.assign(d, { status: "present", workedMin: worked, holidayMin: Math.min(worked, normal), holidayOtMin: otRule(worked - normal, s) });
  } else if (ev === "hwork-missing-out") { ps.push(P(emp, at(date, S + 40), "auto", ctx.method())); d.status = "incomplete"; }
  else if (ev === "leave-on-holiday") { ctx.leaveFor(1, "annual"); } // not counted: the day is not a working day
  else if (ev !== "none") throw new Error("unknown off event " + ev);
  return { punches: ps, day: d };
}

// ---------------------------------------------------------------- profiles (6 staff, each month of 2026)
const pick = (r, list) => { let t = r() * list.reduce((a, x) => a + x[1], 0); for (const [v, w] of list) { if ((t -= w) < 0) return v; } return list[list.length - 1][0]; };
const COMMON = [["ontime", 30], ["grace-edge", 3], ["late-edge", 3], ["late", 8], ["early", 5], ["early-grace", 2], ["ot-edge", 3], ["ot", 10], ["late-ot", 3],
  ["break", 4], ["long-break", 3], ["two-breaks", 2], ["open-break", 2], ["short-day", 2], ["dup-scan", 3], ["explicit-wins", 3], ["missing-out", 2], ["missing-in", 1],
  ["absent", 2], ["leave-full", 2], ["leave-removed", 1], ["leave-half-am", 2], ["leave-half-pm", 2], ["leave-half-absent", 1], ["corr-add", 2], ["corr-edit", 2], ["corr-void", 2]];
const OFF = [["none", 80], ["hwork", 6], ["hwork-ot", 6], ["hwork-short", 2], ["hwork-missing-out", 2], ["leave-on-holiday", 4]];
const PROFILES = [
  { id: "e1", code: "A01", name: "Day default", dept: "Shop", shift: "day", methods: ["pin", "qr"] },
  { id: "e2", code: "A02", name: "Office strict", dept: "Office", shift: "day9", methods: ["pin"] },
  { id: "e3", code: "B01", name: "Night guard", dept: "Security", shift: "night", methods: ["qr", "pin"] },
  { id: "e4", code: "B02", name: "Night approval", dept: "Security", shift: "night8", methods: ["qr"] },
  { id: "e5", code: "C01", name: "Six-day heavy", dept: "Warehouse", shift: "six", methods: ["pin", "face"] },
  { id: "e6", code: "C02", name: "Shift changer", dept: "Shop", shift: "day", methods: ["pin", "qr", "face"] },
  { id: "e7", code: "C03", name: "Part-time mornings", dept: "Shop", shift: "half", methods: ["qr"] }
];
const LEAVE_TYPES = ["sick", "personal", "annual", "maternity", "other"];

function buildMonth(month, mi) {
  const dates = daysOf(month), first = monday(dates[0]), last = plus(monday(dates[dates.length - 1]), 6);
  const range = []; for (let d = first; d <= last; d = plus(d, 1)) range.push(d);
  const holidays = HOLIDAYS.concat(COMPANY[month] || []), substitute = !NO_SUB.has(month);
  const c = { id: month, month, now: Date.UTC(2030, 0, 1), substitute, holidays, shifts: SHIFTS.map(s => Object.assign({}, s)), emps: [], punches: [], audit: [], leave: [], tags: {} };
  const exp = {};
  let seq = 0;
  for (const pf of PROFILES) {
    const r = rng(1000 + mi * 37 + pf.id.charCodeAt(1) * 7919);
    const emp = { id: pf.id, code: pf.code, name: pf.name, dept: pf.dept, shift: pf.shift };
    // shift changer: day -> evening (approval) from the 16th in even months, day -> night from the 16th in odd months
    let hist = null;
    if (pf.id === "e6") { const to = mi % 2 ? "night" : "eve"; hist = [{ from: "2025-01-01", shift: "day" }, { from: month + "-16", shift: to }]; emp.shiftHist = hist; emp.shift = to; }
    const shiftAt = d => { if (!hist) return SH[pf.shift]; let id = hist[0].shift; for (const h of hist) if (h.from <= d) id = h.shift; return SH[id]; };
    c.emps.push(emp);
    const hmaps = new Map(), hmapOf = s => { if (!hmaps.has(s.id)) hmaps.set(s.id, holidaySet(holidays, s.days, substitute)); return hmaps.get(s.id); };
    const tags = new Set(), days = new Map(), leaveDays = new Map();
    const ctxBase = { emp: pf.id, r, voided: new Set(), method: () => pf.methods[Math.floor(r() * pf.methods.length)] };
    // heavy weeks for the six-day profile: one week of > 36 h OT and one of > 48 h normal hours in some months
    const heavyWeeks = pf.id === "e5" && mi % 3 !== 2 ? { ot: plus(first, 7), normal: plus(first, 14) } : null;
    for (const d of range) {
      const s = shiftAt(d), kind = hmapOf(s).has(d) ? "holiday" : s.days.includes(dow(d)) ? "work" : "off";
      const inMonth = d.startsWith(month);
      const ctx = Object.assign(ctxBase, { shift: s, date: d,
        leaveFor: (part, type, removed) => {
          // occasionally an earlier entry for the same day that a later one replaces, or an unknown type
          const t = type || (r() < 0.15 ? "x-unknown" : LEAVE_TYPES[Math.floor(r() * LEAVE_TYPES.length)]);
          if (!removed && r() < 0.2) c.leave.push({ emp: pf.id, date: d, type: "personal", part: 1 });
          const e = { emp: pf.id, date: d, type: t }; if (part === 0.5) e.part = 0.5; if (removed) e.removed = Date.UTC(2026, 0, 1);
          c.leave.push(e); tags.add(removed ? "leave-removed" : part === 0.5 ? "leave-half" : "leave"); if (t === "x-unknown") tags.add("leave-unknown-type");
          return LEAVE_TYPES.includes(t) ? t : "other";
        },
        audit: e => { c.audit.push(Object.assign({ id: "a" + (++seq), at: at(d, 1200) + seq, dev: "dset00001", seq, by: "Manager" }, e)); }
      });
      let ev;
      if (kind === "work") {
        const wk = monday(d);
        if (heavyWeeks && wk === heavyWeeks.ot) ev = "ot-heavy";
        else if (heavyWeeks && wk === heavyWeeks.normal) ev = "long-normal";
        else ev = pick(r, COMMON);
        if (!inMonth && /^(leave|corr|absent)/.test(ev)) ev = "ontime"; // outside the month: plain days (they only feed the weekly limits)
      } else ev = inMonth || pf.id === "e5" ? pick(r, OFF) : "none";
      if (!inMonth && ev === "leave-on-holiday") ev = "none";
      const out = kind === "work" ? workDay(ctx, ev) : offDay(ctx, ev, kind);
      if (ev !== "none") tags.add(kind === "work" ? ev : kind + ":" + ev);
      c.punches.push(...out.punches);
      days.set(d, Object.assign(out.day, { punches: out.punches.filter(p => !ctx.voided.has(p.id)) }));
    }
    // leave entries: the expected leave of a day is the LAST non-removed entry for it, on working days only
    for (const l of c.leave) if (l.emp === pf.id && !l.removed) leaveDays.set(l.date, { type: LEAVE_TYPES.includes(l.type) ? l.type : "other", part: l.part === 0.5 ? 0.5 : 1 });
    for (const [d, day] of days) {
      if (day.kind !== "work") { day.leave = null; continue; }
      const lv = leaveDays.get(d) || null;
      day.leave = lv;
    }
    // OT approval (shifts with otApproval): approve about half of the OT days, withdraw one approval; others stay pending
    for (const [d, day] of days) {
      if (!day.otRaw) continue;
      const s = shiftAt(d);
      if (!s.otApproval) { day.otMin = day.otRaw; continue; }
      tags.add("ot-approval");
      const roll = r();
      if (roll < 0.5) { c.audit.push({ id: "a" + (++seq), at: at(d, 1400) + seq, dev: "dset00001", seq, by: "Manager", action: "ot_approve", emp: pf.id, target: pf.id + "|" + d, before: null, after: { approved: true }, reason: "" }); day.otMin = day.otRaw; }
      else if (roll < 0.6) {
        c.audit.push({ id: "a" + (++seq), at: at(d, 1400) + seq, dev: "dset00001", seq, by: "Manager", action: "ot_approve", emp: pf.id, target: pf.id + "|" + d, before: null, after: { approved: true }, reason: "" });
        c.audit.push({ id: "a" + (++seq), at: at(d, 1500) + seq, dev: "dset00001", seq, by: "Manager", action: "ot_approve", emp: pf.id, target: pf.id + "|" + d, before: { approved: true }, after: { approved: false }, reason: "not agreed" });
        day.pending = true; tags.add("ot-approval-withdrawn");
      } else day.pending = true;
    }
    if (hist) tags.add("shift-change:" + hist[1].shift);
    if (SH[pf.shift].start > SH[pf.shift].end || hist && hist[1].shift === "night") tags.add("night-shift");
    if (!substitute) tags.add("no-substitution");
    if (COMPANY[month]) tags.add("company-holiday");
    // ---- month row from the days of the month
    const row = { scheduled: 0, daysWorked: 0, lateCount: 0, lateMin: 0, earlyCount: 0, earlyMin: 0, otMin: 0, otPendingMin: 0, holidayDays: 0, holidayMin: 0, holidayOtMin: 0,
      leave: Object.fromEntries(LEAVE_TYPES.map(t => [t, 0])), leaveDays: 0, absentDays: 0, incompleteDays: 0, corrections: 0, workedMin: 0, methods: { face: 0, pin: 0, qr: 0, manual: 0 } };
    for (const d of dates) {
      const x = days.get(d);
      if (x.kind === "work") row.scheduled++;
      if (x.status === "present" || x.status === "incomplete") row.daysWorked++;
      if (x.kind !== "work" && x.status === "present") row.holidayDays++;
      if (x.lateMin) { row.lateCount++; row.lateMin += x.lateMin; }
      if (x.earlyMin) { row.earlyCount++; row.earlyMin += x.earlyMin; }
      if (x.kind === "work") { row.otMin += x.pending ? 0 : x.otMin; if (x.pending) row.otPendingMin += x.otRaw; }
      row.holidayMin += x.holidayMin; row.holidayOtMin += x.holidayOtMin;
      if (x.leave) { row.leave[x.leave.type] += x.leave.part; row.leaveDays += x.leave.part; }
      if (x.status === "absent") row.absentDays += x.leave && x.leave.part < 1 ? 0.5 : 1;
      if (x.status === "incomplete") row.incompleteDays++;
      row.corrections += x.corrected;
      row.workedMin += x.workedMin;
      for (const p of x.punches) row.methods[p.method]++;
    }
    // punches added by a correction count as "manual"
    for (const d of dates) row.methods.manual += days.get(d).manual || 0;
    // ---- whole weeks (Monday–Sunday) over the extended range
    const wOt = new Map(), wNorm = new Map();
    for (const d of range) {
      const x = days.get(d), wk = monday(d), ot = x.kind === "work" ? (x.pending ? 0 : x.otMin) : 0;
      wOt.set(wk, (wOt.get(wk) || 0) + ot + x.holidayOtMin);
      wNorm.set(wk, (wNorm.get(wk) || 0) + (x.kind === "work" ? Math.max(0, x.workedMin - x.otRaw) : 0));
    }
    row.maxWeekOtMin = Math.max(0, ...wOt.values()); row.weekOtOver = [...wOt].filter(([, v]) => v > 36 * 60).map(([k]) => k);
    row.maxWeekNormalMin = Math.max(0, ...wNorm.values()); row.weekNormalOver = [...wNorm].filter(([, v]) => v > 48 * 60).map(([k]) => k);
    if (row.weekOtOver.length) tags.add("week-ot-over-36h");
    if (row.weekNormalOver.length) tags.add("week-normal-over-48h");
    if (range[0] < dates[0] || range[range.length - 1] > dates[dates.length - 1]) tags.add("weeks-across-months");
    const sh = shiftAt(dates[dates.length - 1]);
    row.shift = sh.name;
    row.csv = [month, pf.code, pf.name, pf.dept, sh.name, row.scheduled, row.daysWorked, row.lateCount, row.lateMin, row.earlyCount, row.earlyMin, hours(row.otMin), hours(row.otPendingMin),
      row.holidayDays, hours(row.holidayMin), hours(row.holidayOtMin), row.leave.sick, row.leave.personal, row.leave.annual, row.leave.maternity, row.leave.other, row.leaveDays,
      row.absentDays, row.incompleteDays, row.corrections, hours(row.maxWeekOtMin), row.weekOtOver.join(" "), hours(row.maxWeekNormalMin), row.weekNormalOver.join(" ")].map(String);
    exp[pf.id] = row;
    c.tags[pf.id] = [...tags].sort();
  }
  return { c, exp };
}

function main() {
  const argv = process.argv.slice(2), oi = argv.indexOf("--out");
  const dir = oi >= 0 ? argv[oi + 1] : phaseDir("attendance-time");
  const files = ["set.json", "expected.json"].map(f => join(dir, f));
  if (files.some(f => existsSync(f))) { console.error("attendance-time-set: refusing to overwrite an existing set in " + dir + " (write a new phase folder instead)"); process.exit(1); }
  mkdirSync(dir, { recursive: true });
  const cases = [], expected = {};
  for (let m = 1; m <= 12; m++) { const { c, exp } = buildMonth(YEAR + "-" + pad(m), m); cases.push(c); expected[c.id] = exp; }
  const staffMonths = cases.reduce((a, c) => a + c.emps.length, 0);
  const set = { about: "LENSIQ Attendance A1 time-maths set (synthetic). Built by tools/attendance-time-set.mjs; expected values are in expected.json.", staffMonths, cases };
  writeFileSync(files[0], JSON.stringify(set, null, 1) + "\n");
  writeFileSync(files[1], JSON.stringify({ about: "expected month rows per case and employee; csv = the payroll CSV cells", expected }, null, 1) + "\n");
  console.log(`wrote ${cases.length} months x ${PROFILES.length} staff = ${staffMonths} staff-months to ${dir}`);
}
main();

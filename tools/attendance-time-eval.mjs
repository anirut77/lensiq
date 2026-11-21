#!/usr/bin/env node
// tools/attendance-time-eval.mjs — measures Attendance A1 (docs/acceptance/attendance.md): the month maths of
// lensiq-timeclock.js (monthSummary + payrollCsv) on the LOCKED set in ~/LENSIQ-field/evals/attendance-time/
// (set.json + expected.json from tools/attendance-time-set.mjs, hand.json from tools/attendance-time-hand.mjs).
// Source class: SYNTHETIC. Target: 100 % of staff-months equal on every compared number and on the payroll CSV row.
// Compared per staff-month: scheduled, days worked, late (count, minutes), early (count, minutes), OT, OT pending, holiday
// days / hours / OT, leave per type and total, absent, incomplete, corrections, total worked minutes, punch methods,
// weekly OT max + weeks over 36 h, weekly normal max + weeks over 48 h, shift name, and every cell of the payroll CSV row.
//   node tools/attendance-time-eval.mjs [--json]   exit 0 = 100 %, 1 = a difference, 2 = refused (set not locked)
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assertLocked, phaseDir } from "./eval-guard.mjs";

const PHASE = "attendance-time", FILES = ["set.json", "expected.json", "hand.json"];
try { assertLocked(PHASE, FILES); } catch (e) { console.error(String(e && e.message || e)); process.exit(2); }
const dir = phaseDir(PHASE);
const C = createRequire(import.meta.url)("../lensiq-timeclock.js");
const read = f => JSON.parse(readFileSync(join(dir, f), "utf8"));
const set = read("set.json"), exp = read("expected.json").expected, hand = read("hand.json");

/** RFC 4180 rows of the page's CSV (BOM, CRLF, every cell quoted) */
function parseCsv(text) {
  const rows = []; let row = [], cell = "", q = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) { if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\r" && s[i + 1] === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; i++; }
    else cell += ch;
  }
  row.push(cell); rows.push(row);
  return rows;
}
const FIELDS = ["scheduled", "daysWorked", "lateCount", "lateMin", "earlyCount", "earlyMin", "otMin", "otPendingMin", "holidayDays", "holidayMin", "holidayOtMin",
  "leave", "leaveDays", "absentDays", "incompleteDays", "corrections", "workedMin", "methods", "maxWeekOtMin", "weekOtOver", "maxWeekNormalMin", "weekNormalOver", "shift", "csv"];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const results = [], byField = {}, byTag = {};
function run(c, expected, source) {
  const sum = C.monthSummary({ emps: c.emps, shifts: c.shifts, punches: c.punches, audit: c.audit, leave: c.leave, holidays: c.holidays, month: c.month, now: c.now, substitute: c.substitute });
  const csv = parseCsv(C.payrollCsv(sum)), head = csv[0];
  for (const e of c.emps) {
    const row = sum.rows.find(r => r.emp === e.id), want = expected[e.id];
    const got = row ? { ...row, workedMin: (sum.days.get(e.id) || []).reduce((a, d) => a + d.workedMin, 0), csv: csv.find(r => r[1] === e.code) || null } : null;
    const diffs = [];
    if (!got) diffs.push({ field: "row", want: "a row", got: null });
    else for (const f of FIELDS) if (!same(got[f], want[f])) diffs.push({ field: f, want: want[f], got: got[f] });
    for (const d of diffs) byField[d.field] = (byField[d.field] || 0) + 1;
    const tags = (c.tags && c.tags[e.id]) || [];
    for (const t of tags) { const b = byTag[t] || (byTag[t] = { n: 0, ok: 0 }); b.n++; if (!diffs.length) b.ok++; }
    results.push({ case: c.id, emp: e.id, source, ok: !diffs.length, diffs });
  }
  return head;
}
let head = null;
for (const c of set.cases) head = run(c, exp[c.id], "generated") || head;
for (const c of hand.cases) run(c, hand.expected[c.id], "hand");

const n = results.length, ok = results.filter(r => r.ok).length;
const summary = { at: new Date().toISOString(), phase: PHASE, source: "synthetic", staffMonths: n, pass: ok, pct: Math.round(ok / n * 10000) / 100,
  generated: { n: results.filter(r => r.source === "generated").length, ok: results.filter(r => r.source === "generated" && r.ok).length },
  hand: { n: results.filter(r => r.source === "hand").length, ok: results.filter(r => r.source === "hand" && r.ok).length },
  csvColumns: head ? head.length : 0, byField, byTag, failures: results.filter(r => !r.ok).slice(0, 40) };
mkdirSync(join(dir, "results"), { recursive: true });
writeFileSync(join(dir, "results", summary.at.replace(/[:.]/g, "-") + ".json"), JSON.stringify(summary, null, 1) + "\n");
if (process.argv.includes("--json")) console.log(JSON.stringify(summary, null, 1));
else {
  console.log(`Attendance A1 time maths (synthetic, locked set ${PHASE}): ${ok} / ${n} staff-months exact (${summary.pct} %)`);
  console.log(`  generated ${summary.generated.ok}/${summary.generated.n}  hand-worked ${summary.hand.ok}/${summary.hand.n}  payroll CSV columns ${summary.csvColumns}`);
  console.log("  per rule: " + Object.entries(byTag).sort().map(([t, b]) => `${t} ${b.ok}/${b.n}`).join(" · "));
  if (Object.keys(byField).length) console.log("  differences per field: " + JSON.stringify(byField));
  for (const f of summary.failures.slice(0, 10)) console.log(`  FAIL ${f.case} ${f.emp}: ` + f.diffs.map(d => `${d.field} want ${JSON.stringify(d.want)} got ${JSON.stringify(d.got)}`).join("; ").slice(0, 600));
}
process.exit(ok === n ? 0 : 1);

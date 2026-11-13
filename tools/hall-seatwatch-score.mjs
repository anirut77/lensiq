#!/usr/bin/env node
// tools/hall-seatwatch-score.mjs — scores the LENSIQ Exam hall "seat watch" measurement (mock exam with consenting adult
// volunteers, docs/pilot/PILOT-HALL-SEATWATCH.md, Thai steps in docs/pilot/SEATWATCH-SCORING-TH.md). Reads, per session:
// the labeller's sheet (docs/pilot/label-sheet-template.csv), the event log of every camera device / block as exported by
// exam-hall.html ("export events", {format: "lensiq-exam", msgs}) or made by tools/hall-seatwatch-replay.mjs from a
// consented recording, and the session record (session.json: blocks, seats, clock readings, settings). Writes the result
// sheet (RESULT-SHEET.md), per-event and per-alert CSVs and result.json into --out (OUTSIDE the repo).
//
//   node tools/hall-seatwatch-score.mjs --session S.json [--session S2.json ...] --out DIR [--causes causes.csv]
//
// The scoring rule (RULE, version seatwatch-score-v1) is LOCKED: tests/unit/hall-seatwatch-score.test.js, hash in
// evals-locks/gate-hall-h.sha256. It is the protocol's §4 – §6 written as code; it is never changed after a held-out block
// has been opened (a new rule = a new version and a new held-out session).
// causes.csv (optional, filled by operator + labeller after the sheet is handed in): alert_id,cause,note with cause one of
// RULE.causes or "unsure". Unsure alerts are left out of the main false-alert line and counted in the worst-case line.
// Nothing leaves the machine. No names: seats only.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fz = o => Object.freeze(o);

export const RULE = fz({
  version: "seatwatch-score-v1",
  // hold time H per signal (s) as built in lensiq-exam.js; window = [start - pre, start + H + post]
  H: fz({ empty: 20, back: 2, early: 180, extra: 5, aisle: 8, lean: 4, phone: 2 }),
  pre: 5, post: 15,
  // a labelled fact shorter than this is GREY: never a miss, an alert on it is not false
  scoreMin: fz({ LEAVE: 35, AISLE: 23, SECOND: 20, LEAN: 19, PHONE: 15 }),
  earlyMin: 195, cooldown: 95, camMovedSec: 300,
  // scripted lengths (s) when the sheet has no actual end
  scripted: fz({ LEAVE: 70, AISLE: 25, SECOND: 30, LEAN: 20, STAND: 12, PHONE_DESK: 20, PHONE_HAND: 20, STAFF_WALK: 30, DISTRACT: 15 }),
  causes: fz(["person-missed", "object", "standing", "wrong-seat", "staff", "posture", "light", "camera-moved", "unknown"]),
  alertSigs: fz(["empty", "back", "early", "extra", "aisle", "lean", "phone"]),
  minEvents: 55
});
const TYPES = ["LEAVE", "AISLE", "SECOND", "LEAN", "STAND", "PHONE_DESK", "PHONE_HAND", "STAFF_WALK", "DISTRACT", "CAM_MOVED", "OTHER"];
export const SOURCE_EN = "source: field (mock exam, adult volunteers, scripted)";
export const SOURCE_TH = "ที่มา: หน้างานจริง (สอบจำลอง อาสาสมัครผู้ใหญ่ ทำตามบท)";

/* ---------- small helpers ---------- */
export function parseClock(s) {
  const t = String(s == null ? "" : s).trim();
  if (!t) return null;
  const p = t.split(":");
  if (p.length < 2 || p.length > 3 || p.some(x => !/^\d+(\.\d+)?$/.test(x))) throw new Error(`time "${t}" (use mm:ss or h:mm:ss)`);
  return p.map(Number).reduce((a, x) => a * 60 + x, 0);
}
const laptopMs = v => (typeof v === "number" ? v : Date.parse(v));
/** laptop epoch ms -> seconds on the room timer, from the start (and optional end) reading of the block */
export function toTimer(tMs, clock) {
  const s0 = parseClock(clock.start.timer), l0 = laptopMs(clock.start.laptop);
  let rate = 1;
  if (clock.end && clock.end.laptop != null) {
    const s1 = parseClock(clock.end.timer), l1 = laptopMs(clock.end.laptop);
    if (l1 > l0 && s1 > s0) rate = (s1 - s0) / ((l1 - l0) / 1000);
  }
  return s0 + ((tMs - l0) / 1000) * rate;
}
export function parseCsv(text) {
  const rows = []; let row = [], cell = "", q = false;
  const s = String(text || "").replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && s[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => String(x).trim() !== ""));
}
export function wilson(x, n, z = 1.959964) {
  if (!n) return { x, n, p: null, lo: null, hi: null };
  const p = x / n, d = 1 + z * z / n, c = p + z * z / (2 * n), h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return { x, n, p, lo: Math.max(0, (c - h) / d), hi: Math.min(1, (c + h) / d) };
}
/* regularised lower incomplete gamma P(a, x) (series / continued fraction) */
function lgamma(z) {
  const g = [76.18009172947146, -86.50532032941678, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let x = z, y = z, t = x + 5.5; t -= (x + 0.5) * Math.log(t); let s = 1.000000000190015;
  for (const c of g) s += c / ++y;
  return -t + Math.log(2.5066282746310007 * s / x);
}
function gammaP(a, x) {
  if (x <= 0) return 0;
  if (x < a + 1) {
    let sum = 1 / a, d = sum, ap = a;
    for (let n = 0; n < 500; n++) { ap++; d *= x / ap; sum += d; if (Math.abs(d) < Math.abs(sum) * 1e-15) break; }
    return sum * Math.exp(-x + a * Math.log(x) - lgamma(a)); }
  let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300; c = b + an / c;
    if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-15) break; }
  return 1 - Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
}
/** x with P(a, x) = p (bisection) */
function gammaInv(a, p) {
  let lo = 0, hi = Math.max(10, a * 10); while (gammaP(a, hi) < p) hi *= 2;
  for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (gammaP(a, m) < p) lo = m; else hi = m; } return (lo + hi) / 2; }
/** exact Poisson 95 % interval for k events: lo / hi two-sided, hi1 one-sided upper */
export function poisson(k) {
  return { k, lo: k === 0 ? 0 : gammaInv(k, 0.025), hi: gammaInv(k + 1, 0.975), hi1: gammaInv(k + 1, 0.95) };
}
const median = a => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pct90 = a => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.ceil(0.9 * s.length) - 1)] : null; };

/* ---------- label sheet ---------- */
export function parseLabelSheet(text) {
  const rows = parseCsv(text), events = [], errors = [];
  if (!rows.length) return { events, errors: ["the label sheet is empty"] };
  const head = rows[0].map(h => h.trim().toLowerCase()), col = k => head.indexOf(k);
  for (const k of ["block", "event_type", "seat", "on_time", "planned_time", "actual_start", "actual_end"]) if (col(k) < 0) errors.push(`missing column ${k}`);
  if (errors.length) return { events, errors };
  rows.slice(1).forEach(r => {
    const get = k => (col(k) >= 0 ? String(r[col(k)] == null ? "" : r[col(k)]).trim() : "");
    const sid = get("session_id"), rowNo = get("row") || "?";
    if (/^EXAMPLE/i.test(sid) || sid.startsWith("#")) return;
    const type = get("event_type").toUpperCase(), on = get("on_time").toUpperCase(), source = get("source").toLowerCase() || "scripted";
    if (on === "X") return; // struck: the cue was not done
    if (!TYPES.includes(type)) { errors.push(`row ${rowNo}: event type "${type}"`); return; }
    try {
      let start, end = parseClock(get("actual_end"));
      if (on === "Y" && source !== "unscripted") start = parseClock(get("planned_time"));
      else start = parseClock(get("actual_start"));
      if (start == null) { errors.push(`row ${rowNo}: ${type} needs actual_start (on_time N or unscripted)`); return; }
      if (end == null) {
        if (type === "LEAVE") { errors.push(`row ${rowNo}: LEAVE needs actual_end (time back in the seat)`); return; }
        if (type === "CAM_MOVED") end = start;
        else if (RULE.scripted[type] != null && on === "Y") end = start + RULE.scripted[type];
        else if (RULE.scripted[type] != null) end = start + RULE.scripted[type];
        else { errors.push(`row ${rowNo}: ${type} needs actual_end`); return; }
      }
      if (end < start) { errors.push(`row ${rowNo}: end before start`); return; }
      events.push({ session: sid, block: get("block"), row: rowNo, source, type, seat: get("seat"), target: get("target_seat"), start, end,
        onTime: on, walk: get("walk_mode").toLowerCase(), objectOnChair: /^y/i.test(get("object_on_chair")), note: get("note") });
    } catch (e) { errors.push(`row ${rowNo}: ${e.message}`); }
  });
  return { events, errors };
}

/* ---------- labelled facts -> expected signals ---------- */
export function expectedSignals(events, block) {
  const out = [], minLeave = block && Number.isFinite(block.minLeaveMin) ? block.minLeaveMin * 60 : Infinity;
  const firstLong = new Set();
  const sorted = events.slice().sort((a, b) => a.start - b.start);
  for (const e of sorted) {
    const dur = e.end - e.start, from = e.type;
    const push = (sig, seat, ref, end, min, extra) => out.push(Object.assign({ sig, seat, ref, end, from, row: e.row, dur,
      scoreable: dur >= min, grey: dur < min, objectOnChair: e.objectOnChair }, extra || {}));
    if (from === "LEAVE") {
      push("empty", e.seat, e.start, e.end, RULE.scoreMin.LEAVE);
      push("back", e.seat, e.end, e.end, RULE.scoreMin.LEAVE, { away: dur });
      if (dur >= RULE.H.early && !firstLong.has(e.seat) && e.start + RULE.H.early < minLeave) {
        firstLong.add(e.seat);
        push("early", e.seat, e.start, e.end, RULE.earlyMin);
      }
    } else if (from === "AISLE") push("aisle", "", e.start, e.end, RULE.scoreMin.AISLE);
    else if (from === "STAFF_WALK" && e.walk === "off") push("aisle", "", e.start, e.end, RULE.scoreMin.AISLE, { staff: true });
    else if (from === "SECOND") push("extra", e.target || e.seat, e.start, e.end, RULE.scoreMin.SECOND);
    else if (from === "LEAN") push("lean", e.seat, e.start, e.end, RULE.scoreMin.LEAN);
    else if ((from === "PHONE_DESK" || from === "PHONE_HAND") && block && block.phoneOn) push("phone", e.seat, e.start, e.end, RULE.scoreMin.PHONE);
  }
  return out;
}

/* ---------- one block: alerts vs expected ---------- */
const sameSeat = (x, a) => x.sig === "aisle" || x.seat === a.seat;
export function scoreBlock({ events, alerts, block }) {
  const exp = expectedSignals(events, block);
  const sigsOn = RULE.alertSigs.filter(s => s !== "phone" || block.phoneOn);
  const all = (alerts || []).filter(m => m && (m.type == null || m.type === "ev")).map(m => ({ id: m.id, sig: m.sig, seat: m.seat || "", lvl: m.lvl,
    s: m.ts != null ? m.ts : toTimer(m.t, block.clock), dur: m.dur })).sort((a, b) => a.s - b.s);
  const nonAlerts = {};
  const cand = [];
  for (const a of all) { if (RULE.alertSigs.includes(a.sig)) cand.push(a); else nonAlerts[a.sig] = (nonAlerts[a.sig] || 0) + 1; }
  const used = new Map(); // alert -> role
  const win = x => [x.ref - RULE.pre, x.ref + (x.sig === "back" ? 0 : RULE.H[x.sig]) + RULE.post];
  // cooldown: an alert of this signal (and seat) in the 95 s before the start -> the system is silent by design: grey
  for (const x of exp) {
    if (!["extra", "lean", "aisle", "phone"].includes(x.sig) || !x.scoreable) continue;
    if (cand.some(a => a.sig === x.sig && sameSeat(x, a) && a.s >= x.ref - RULE.cooldown && a.s < x.ref - RULE.pre)) { x.scoreable = false; x.grey = true; x.cooldown = true; }
  }
  const order = exp.slice().sort((a, b) => a.ref - b.ref);
  for (const x of order) {
    const [w0, w1] = win(x);
    const a = cand.find(a => !used.has(a) && a.sig === x.sig && sameSeat(x, a) && a.s >= w0 && a.s <= w1);
    if (a) { used.set(a, "match"); x.alert = a; }
  }
  for (const x of order) { // late: right signal and seat, after the window, while the fact is still true
    if (x.alert || !x.scoreable) continue;
    const [, w1] = win(x);
    const a = cand.find(a => !used.has(a) && a.sig === x.sig && sameSeat(x, a) && a.s > w1 && a.s <= x.end);
    if (a) { used.set(a, "late"); x.late = a; }
  }
  for (const a of cand) { // repeats: a later alert for a fact that is still true and already shown
    if (used.has(a)) continue;
    const x = order.find(x => (x.alert || x.late) && x.sig === a.sig && sameSeat(x, a) && a.s >= x.ref - RULE.pre && a.s <= x.end + RULE.post);
    if (x) used.set(a, "repeat");
  }
  const camWins = events.filter(e => e.type === "CAM_MOVED").map(e => [e.start, e.start + RULE.camMovedSec]);
  const camMoved = [], falseAlerts = [];
  for (const a of cand) {
    if (used.has(a)) continue;
    if (!sigsOn.includes(a.sig) && a.sig !== "phone") continue;
    if (camWins.some(([s, e]) => a.s >= s && a.s <= e)) { camMoved.push(a); continue; }
    // cause hint from the labelled context (the operator confirms the cause in causes.csv)
    const ctx = events.find(e => a.s >= e.start - RULE.pre && a.s <= e.end + RULE.post && (
      (e.type === "STAFF_WALK") || ((e.type === "STAND" || e.type === "DISTRACT") && (a.seat === e.seat || a.sig === "aisle"))));
    const hint = !ctx ? "" : ctx.type === "STAFF_WALK" ? "staff" : ctx.type === "STAND" ? "standing" : "posture";
    falseAlerts.push({ id: a.id, sig: a.sig, seat: a.seat, lvl: a.lvl, s: Math.round(a.s * 10) / 10, hint });
  }
  const bySig = {};
  for (const sig of sigsOn) {
    const X = exp.filter(x => x.sig === sig);
    if (sig === "phone" && !block.phoneOn) continue;
    const sc = X.filter(x => x.scoreable), found = sc.filter(x => x.alert);
    bySig[sig] = { scoreable: sc.length, found: found.length, late: sc.filter(x => x.late).length, greyHits: X.filter(x => x.grey && x.alert).length,
      trueAlerts: X.filter(x => x.alert).length, repeats: cand.filter(a => a.sig === sig && used.get(a) === "repeat").length,
      cooldownGrey: X.filter(x => x.cooldown).length, staff: sc.filter(x => x.staff).length, staffFound: found.filter(x => x.staff).length,
      objectOnChair: sc.filter(x => x.objectOnChair).length, objectFound: found.filter(x => x.objectOnChair).length,
      times: found.map(x => Math.round((x.alert.s - x.ref) * 10) / 10) };
  }
  const awayErr = exp.filter(x => x.sig === "back" && x.alert && Number.isFinite(x.alert.dur)).map(x => Math.round(Math.abs(x.alert.dur / 1000 - x.away) * 10) / 10);
  const misses = exp.filter(x => x.scoreable && !x.alert).map(x => ({ sig: x.sig, seat: x.seat, ref: x.ref, row: x.row, late: !!x.late }));
  const seatHours = (block.seats || []).length * (Number(block.monitoredSec) || 0) / 3600;
  return { block: block.block, split: block.split, variant: block.variant, seatHours, bySig, falseAlerts, camMoved, misses, nonAlerts, awayErr,
    fps: block.fps || [], expected: exp.map(x => ({ sig: x.sig, seat: x.seat, ref: x.ref, end: x.end, row: x.row, scoreable: x.scoreable, grey: x.grey,
      cooldown: !!x.cooldown, staff: !!x.staff, found: !!x.alert, late: !!x.late, alert: x.alert ? x.alert.id : "" })),
    alerts: all.map(a => ({ id: a.id, sig: a.sig, seat: a.seat, lvl: a.lvl, s: Math.round(a.s * 10) / 10,
      role: used.get(a) || (RULE.alertSigs.includes(a.sig) ? (camMoved.includes(a) ? "camera-moved" : "false") : "not-an-alert") })) };
}

/* ---------- summary over blocks, per split, with the targets ---------- */
export function summarize(blocks, { causes = {} } = {}) {
  const out = {};
  for (const split of ["dev", "heldout"]) {
    const B = blocks.filter(b => (b.split || "heldout") === split);
    if (!B.length) continue;
    const bySig = {};
    for (const b of B) for (const [sig, s] of Object.entries(b.bySig)) {
      const t = bySig[sig] || (bySig[sig] = { scoreable: 0, found: 0, late: 0, greyHits: 0, trueAlerts: 0, repeats: 0, cooldownGrey: 0, times: [] });
      for (const k of ["scoreable", "found", "late", "greyHits", "trueAlerts", "repeats", "cooldownGrey"]) t[k] += s[k] || 0;
      t.times.push(...(s.times || []));
    }
    const falseAll = B.flatMap(b => b.falseAlerts), unsure = falseAll.filter(f => causes[f.id] === "unsure");
    const main = falseAll.filter(f => causes[f.id] !== "unsure"), seatHours = B.reduce((a, b) => a + b.seatHours, 0);
    for (const [sig, t] of Object.entries(bySig)) {
      t.recall = wilson(t.found, t.scoreable); t.falseN = main.filter(f => f.sig === sig).length;
      t.precision = wilson(t.trueAlerts, t.trueAlerts + t.falseN);
      t.median = median(t.times); t.p90 = pct90(t.times); t.max = t.times.length ? Math.max(...t.times) : null;
    }
    const rate = (k) => (seatHours > 0 ? k / seatHours : null), pois = poisson(main.length);
    const watchN = main.filter(f => f.lvl === "watch" || f.lvl === "check").length;
    const variantA = B.every(b => b.variant === "A");
    const tgt = (sig, lb) => {
      const t = bySig[sig];
      if (!t || t.scoreable < RULE.minEvents) return { pass: null, n: t ? t.scoreable : 0, note: `not enough events (${t ? t.scoreable : 0} < ${RULE.minEvents})` };
      return { pass: t.recall.lo >= lb, n: t.scoreable, lo: t.recall.lo };
    };
    const awayErr = B.flatMap(b => b.awayErr), fps = B.flatMap(b => b.fps || []);
    const T5 = {};
    for (const [sig, t] of Object.entries(bySig)) if (sig !== "early" && t.times.length) T5[sig] = { median: t.median, p90: t.p90, pass: t.median <= RULE.H[sig] + 5 && t.p90 <= RULE.H[sig] + 10 };
    out[split] = {
      blocks: B.map(b => b.block), seatHours, bySig, falseMain: main.length, falseWorst: main.length + unsure.length, unsure: unsure.length,
      falseWatch: watchN, falsePerSeatHour: rate(main.length), poisson: pois,
      perExam30x3: rate(main.length) == null ? null : rate(main.length) * 90,
      camMoved: B.reduce((a, b) => a + b.camMoved.length, 0), misses: B.flatMap(b => b.misses),
      nonAlerts: B.reduce((a, b) => { for (const [k, v] of Object.entries(b.nonAlerts)) a[k] = (a[k] || 0) + v; return a; }, {}),
      causes: main.reduce((a, f) => { const c = causes[f.id] || f.hint || "unknown"; a[c] = (a[c] || 0) + 1; return a; }, {}),
      targets: {
        T1: { empty: tgt("empty", 0.8), back: tgt("back", 0.8), aisle: tgt("aisle", 0.8) },
        T2: { extra: tgt("extra", 0.7), lean: tgt("lean", 0.7) },
        T3: { early: { pass: null, note: "report only" } },
        T4: variantA ? { pass: rate(main.length) * 90 <= 3 && rate(watchN) * 90 <= 1, perExam: rate(main.length) * 90 }
          : { pass: null, note: "judged on variant A (30 seats x 3 h) only" },
        T5, T6: { median: median(awayErr), p90: pct90(awayErr), pass: awayErr.length ? median(awayErr) <= 10 : null },
        T7: { min: fps.length ? Math.min(...fps) : null, pass: fps.length ? Math.min(...fps) >= 2 : null }
      }
    };
  }
  return out;
}

/* ---------- result sheet ---------- */
const pc = w => (w && w.p != null ? `${(w.p * 100).toFixed(1)} %` : "—");
const ci = w => (w && w.lo != null ? `${(w.lo * 100).toFixed(1)} – ${(w.hi * 100).toFixed(1)} %` : "—");
const yn = p => (p === true ? "pass" : p === false ? "**fail**" : "—");
export function formatSheet(S, meta = {}) {
  const names = meta.sessions && meta.sessions.length ? meta.sessions.join(", ") : meta.session || "";
  const L = [`# Seat-watch result sheet — ${names} ${meta.date || ""}`.trim(), "",
    `> ${SOURCE_EN}. ${SOURCE_TH}. Scoring rule ${RULE.version} (locked, tests/unit/hall-seatwatch-score.test.js).`,
    "> Seats only, no names. An independent reviewer recomputes this sheet from the exported logs and the label CSV before it goes to the owner.", ""];
  const TG = { empty: "LB ≥ 80 %", back: "LB ≥ 80 %", aisle: "LB ≥ 80 %", extra: "LB ≥ 70 %", lean: "LB ≥ 70 %", early: "report", phone: "report" };
  for (const split of ["dev", "heldout"]) {
    const s = S[split];
    if (!s) continue;
    L.push(`## ${split === "dev" ? "Dev (setup only, not a claim)" : "Held-out"} — blocks ${s.blocks.join(", ")} · ${s.seatHours.toFixed(1)} seat-hours`, "",
      "| Signal | Scoreable events | Found | Recall | Wilson 95 % | Target | Pass? | Late | Median / p90 time to alert (s) | False alerts | Repeats | Grey hits |",
      "|---|---|---|---|---|---|---|---|---|---|---|---|");
    for (const sig of ["empty", "back", "aisle", "extra", "lean", "early", "phone"]) {
      const t = s.bySig[sig];
      if (!t && sig === "phone") continue;
      if (!t) { L.push(`| ${sig} | 0 | 0 | — | — | ${TG[sig]} | — | 0 | — | 0 | 0 | 0 |`); continue; }
      const tg = (s.targets.T1[sig] || s.targets.T2[sig] || {});
      L.push(`| ${sig} | ${t.scoreable} | ${t.found} | ${pc(t.recall)} | ${ci(t.recall)} | ${TG[sig]} | ${tg.note ? tg.note : yn(tg.pass)} | ${t.late} `
        + `| ${t.median == null ? "—" : t.median} / ${t.p90 == null ? "—" : t.p90} | ${t.falseN} | ${t.repeats} | ${t.greyHits} |`);
    }
    const p = s.poisson, f = v => (v == null ? "—" : v.toFixed(3));
    L.push("", "| False alerts | Count | Seat-hours | Per seat-hour | Poisson 95 % (per seat-hour) | Per 30-seat 3-h exam | Target | Unsure (worst case) |",
      "|---|---|---|---|---|---|---|---|",
      `| all signals | ${s.falseMain} | ${s.seatHours.toFixed(1)} | ${f(s.falsePerSeatHour)} | ${s.seatHours ? `${f(p.lo / s.seatHours)} – ${f(p.hi / s.seatHours)} (one-sided upper ${f(p.hi1 / s.seatHours)})` : "—"} | ${s.perExam30x3 == null ? "—" : s.perExam30x3.toFixed(1)} | ≤ 3 (variant A): ${s.targets.T4.note || yn(s.targets.T4.pass)} | ${s.unsure} → worst case ${s.falseWorst} |`,
      `| Watch / Check only | ${s.falseWatch} | | | | | ≤ 1 | |`, "",
      `Causes: ${Object.entries(s.causes).map(([k, v]) => `${k} ${v}`).join(" · ") || "—"} · alerts in the camera-moved window: ${s.camMoved} · not alerts: ${Object.entries(s.nonAlerts).map(([k, v]) => `${k} ${v}`).join(" · ") || "—"}`,
      `T5 time to alert: ${Object.entries(s.targets.T5).map(([k, v]) => `${k} ${v.median} / ${v.p90} s ${yn(v.pass)}`).join(" · ") || "—"}`
        + ` · T6 time-away error median ${s.targets.T6.median == null ? "—" : s.targets.T6.median + " s"} ${yn(s.targets.T6.pass)}`
        + ` · T7 rounds per second min ${s.targets.T7.min == null ? "—" : s.targets.T7.min} ${yn(s.targets.T7.pass)}`, "");
  }
  return L.join("\n");
}

/* ---------- CLI ---------- */
const csvCell = v => { const s = v == null ? "" : String(v); return /[",\r\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const toCsv = (head, rows) => [head.join(","), ...rows.map(r => head.map(h => csvCell(r[h])).join(","))].join("\n") + "\n";
function insideRepo(p) { const r = relative(repo, resolve(p)); return r === "" || (!r.startsWith("..") && !isAbsolute(r)); }
function readLog(file, block) {
  const j = JSON.parse(readFileSync(file, "utf8"));
  const msgs = Array.isArray(j) ? j : j && j.format === "lensiq-exam" && Array.isArray(j.msgs) ? j.msgs : null;
  if (!msgs) throw new Error(`${file}: not an exam-hall event export`);
  return msgs.filter(m => m && m.type === "ev" && (!block.node || m.node === block.node));
}
export async function main(argv, io = {}) {
  const log = io.log || console.log, err = io.err || console.error;
  const sessions = [], o = { out: null, causes: null };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = () => argv[++i];
    if (k === "--session") sessions.push(v()); else if (k === "--out") o.out = v(); else if (k === "--causes") o.causes = v();
    else { err(`hall-seatwatch-score: unknown argument ${k}`); return 2; }
  }
  if (!sessions.length || !o.out) { err("usage: node tools/hall-seatwatch-score.mjs --session session.json [--session ...] --out DIR [--causes causes.csv]"); return 2; }
  if (insideRepo(o.out)) { err("hall-seatwatch-score: --out must be outside the repo (results of sessions with people stay out of git)"); return 2; }
  try {
    const blocks = [], events = [], errors = [];
    const meta = { sessions: [], date: "" };
    for (const sf of sessions) {
      const S = JSON.parse(readFileSync(sf, "utf8")), base = dirname(resolve(sf));
      meta.sessions.push(S.session); meta.date = [meta.date, S.date].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(", ");
      const lab = parseLabelSheet(readFileSync(resolve(base, S.labels), "utf8"));
      errors.push(...lab.errors.map(e => `${S.session}: ${e}`));
      for (const b0 of S.blocks || []) {
        const b = { split: S.split, variant: S.variant, phoneOn: !!S.phoneOn, ...b0 };
        const ev = lab.events.filter(e => e.block === b.block);
        const r = scoreBlock({ events: ev, alerts: readLog(resolve(base, b.log), b), block: b });
        r.session = S.session; blocks.push(r); events.push(...ev.map(e => ({ ...e, session: S.session })));
      }
    }
    if (errors.length) { err("label sheet:\n  " + errors.join("\n  ")); return 2; }
    const causes = {};
    if (o.causes) for (const r of parseCsv(readFileSync(o.causes, "utf8")).slice(1)) {
      const c = String(r[1] || "").trim();
      if (c && c !== "unsure" && !RULE.causes.includes(c)) { err(`causes: "${c}" is not one of ${RULE.causes.join(", ")}, unsure`); return 2; }
      if (r[0]) causes[String(r[0]).trim()] = c;
    }
    const S = summarize(blocks, { causes });
    mkdirSync(o.out, { recursive: true });
    writeFileSync(join(o.out, "RESULT-SHEET.md"), formatSheet(S, meta));
    writeFileSync(join(o.out, "result.json"), JSON.stringify({ rule: RULE.version, summary: S, blocks }, null, 1));
    writeFileSync(join(o.out, "events.csv"), toCsv(["session", "block", "sig", "seat", "ref", "end", "row", "scoreable", "grey", "cooldown", "staff", "found", "late", "alert"],
      blocks.flatMap(b => b.expected.map(x => ({ session: b.session, block: b.block, ...x })))));
    writeFileSync(join(o.out, "alerts.csv"), toCsv(["session", "block", "id", "sig", "seat", "lvl", "s", "role", "hint", "cause"],
      blocks.flatMap(b => b.alerts.map(a => ({ session: b.session, block: b.block, ...a, hint: (b.falseAlerts.find(f => f.id === a.id) || {}).hint || "", cause: causes[a.id] || "" })))));
    log(`hall-seatwatch-score: ${blocks.length} block(s) scored with ${RULE.version} -> ${o.out}`);
    if (!existsSync(join(o.out, "RESULT-SHEET.md"))) return 2;
    return 0;
  } catch (e) { err("hall-seatwatch-score: " + (e && e.message || e)); return 2; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main(process.argv.slice(2));

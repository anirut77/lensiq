/* lensiq-timeclock.js — pure time-attendance maths for the employee mode of attendance.html (no DOM, no storage).
   Everything here is deterministic: times are epoch ms, "local" time uses a fixed offset (Thailand = UTC+7, no DST),
   so the same punches give the same report on every device and in Node unit tests.
     shifts        normShift / shiftWindow / shiftDateOf   (night shifts that cross midnight belong to the start date)
     day maths     daySummary  -> late / early-leave / OT (grace minutes, minimum OT, rounding) / breaks / holiday work
     month         monthSummary -> per-employee rows for payroll + per-day detail; weekly OT > 36 h flagged (s.26 rule)
     calendar      Thai public holidays (fixed dates + 2026 lunar dates, editable), substitution day when a holiday
                   falls on a weekly rest day (Labour Protection Act s.29), leave days (full / half)
     corrections   append-only audit log (who / before / after / reason) with a per-device SHA-256 hash chain;
                   raw punches are never edited — applyCorrections() derives the effective punches
     fallback      PIN hashing (salted, iterated SHA-256), wrong-PIN lockout, QR badge payload LQAT1.<code>.<token>
     multi-device  cleanPack (strict allowlist, like lensiq-agg.js) + mergePacks (dedupe by id)
     retention     time records kept >= 2 years (Labour Protection Act s.114) — separate from face-template retention
   Browser: window.LQClock · Node: require("./lensiq-timeclock.js") */
(/** @param {any} root @param {() => any} factory */ function (root, factory) {
  const m = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = m; else root.LQClock = m;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const MIN = 60000, HOUR = 3600000, DAY = 86400000;
  const TZ = 420; // UTC+7 (Asia/Bangkok, no daylight saving)
  const PUNCH_TYPES = ["auto", "in", "out", "break_out", "break_in"];
  const METHODS = ["face", "pin", "qr", "manual"];
  const LEAVE_TYPES = ["sick", "personal", "annual", "maternity", "other"];
  const MIN_RETENTION_YEARS = 2; // Labour Protection Act B.E. 2541 s.114: wage / time documents >= 2 years
  const WEEK_OT_CAP_MIN = 36 * 60; // Ministerial regulation under s.26: OT + holiday OT <= 36 h per week
  const WEEK_NORMAL_CAP_MIN = 48 * 60; // s.23: normal working time <= 48 h per week

  // ---------------------------------------------------------------- dates / clock (fixed offset)
  const pad = n => String(n).padStart(2, "0");
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/, HM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
  /** "08:30" -> 510 (minutes after midnight); NaN when malformed */
  function hm(s) { const m = HM_RE.exec(String(s || "")); return m ? +m[1] * 60 + +m[2] : NaN; }
  /** 510 -> "08:30" (wraps past 24 h) */
  function fmtHM(min) { const m = ((Math.round(min) % 1440) + 1440) % 1440; return pad(Math.floor(m / 60)) + ":" + pad(m % 60); }
  /** epoch ms -> "YYYY-MM-DD" in local (offset) time */
  function dateKey(ts, tz = TZ) { const d = new Date(ts + tz * MIN); return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()); }
  /** epoch ms -> "HH:MM" in local time */
  function clock(ts, tz = TZ) { const d = new Date(ts + tz * MIN); return pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()); }
  function isDate(s) { return typeof s === "string" && DATE_RE.test(s) && !isNaN(Date.parse(s + "T00:00:00Z")) && new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s; }
  /** local midnight of a date as epoch ms */
  function dayStart(date, tz = TZ) { const [y, m, d] = date.split("-").map(Number); return Date.UTC(y, m - 1, d) - tz * MIN; }
  function addDays(date, n) { const [y, m, d] = date.split("-").map(Number); const t = new Date(Date.UTC(y, m - 1, d + n)); return t.getUTCFullYear() + "-" + pad(t.getUTCMonth() + 1) + "-" + pad(t.getUTCDate()); }
  /** 0 = Sunday … 6 = Saturday */
  function weekday(date) { const [y, m, d] = date.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); }
  function monthDays(month) { const [y, m] = month.split("-").map(Number); const n = new Date(Date.UTC(y, m, 0)).getUTCDate(); return Array.from({ length: n }, (_, i) => month + "-" + pad(i + 1)); }
  /** Monday of the ISO week of a date */
  function weekOf(date) { return addDays(date, -((weekday(date) + 6) % 7)); }

  // ---------------------------------------------------------------- shifts
  /**
   * @typedef {{id: string, name: string, start: string, end: string, breakMin: number, graceLate: number, graceEarly: number,
   *   otMinMin: number, otRound: number, otStartAfter: number, otApproval: boolean, days: number[], pre: number}} Shift
   */
  const SHIFT_DEFAULTS = { breakMin: 60, graceLate: 5, graceEarly: 0, otMinMin: 30, otRound: 15, otStartAfter: 0, otApproval: false, days: [1, 2, 3, 4, 5], pre: 240 };
  const clampInt = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  /** fills defaults and clamps every number; throws on a malformed start / end time @returns {Shift} */
  function normShift(s) {
    s = s || {};
    if (isNaN(hm(s.start)) || isNaN(hm(s.end))) throw new Error("shift start/end must be HH:MM");
    const D = SHIFT_DEFAULTS;
    const days = Array.isArray(s.days) ? [...new Set(s.days.map(Number).filter(d => d >= 0 && d <= 6 && Number.isInteger(d)))].sort() : D.days.slice();
    return {
      id: String(s.id || "s1"), name: String(s.name || s.start + "–" + s.end).slice(0, 40), start: s.start, end: s.end,
      breakMin: clampInt(s.breakMin, 0, 240, D.breakMin), graceLate: clampInt(s.graceLate, 0, 120, D.graceLate),
      graceEarly: clampInt(s.graceEarly, 0, 120, D.graceEarly), otMinMin: clampInt(s.otMinMin, 0, 240, D.otMinMin),
      otRound: clampInt(s.otRound, 1, 60, D.otRound), otStartAfter: clampInt(s.otStartAfter, 0, 240, D.otStartAfter),
      otApproval: !!s.otApproval, days, pre: clampInt(s.pre, 30, 600, D.pre)
    };
  }
  /** true when the shift ends on the next calendar day (e.g. 22:00–06:00) */
  function crossesMidnight(shift) { return hm(shift.end) <= hm(shift.start); }
  /** scheduled minutes of work (span minus the unpaid break) */
  function shiftMinutes(shift) { const span = (hm(shift.end) - hm(shift.start) + 1440) % 1440 || 1440; return Math.max(0, span - shift.breakMin); }
  /** absolute times of a shift on a date: the 24 h slice [from, to) that owns punches starts `pre` minutes before the start */
  function shiftWindow(shift, date, tz = TZ) {
    const d0 = dayStart(date, tz), start = d0 + hm(shift.start) * MIN;
    let end = d0 + hm(shift.end) * MIN; if (end <= start) end += DAY;
    const from = start - shift.pre * MIN;
    return { start, end, from, to: from + DAY };
  }
  /** the shift date a punch belongs to (a 02:00 punch of a 22:00–06:00 shift belongs to the previous day) */
  function shiftDateOf(ts, shift, tz = TZ) {
    const d = dateKey(ts, tz);
    for (const c of [addDays(d, 1), d, addDays(d, -1)]) { const w = shiftWindow(shift, c, tz); if (ts >= w.from && ts < w.to) return c; }
    return d; // unreachable: the three slices cover 72 h around ts
  }

  // ---------------------------------------------------------------- one day
  /**
   * @typedef {{id: string, emp: string, ts: number, type: string, method: string, dev?: string, corrected?: boolean}} Punch
   * @typedef {{date: string, kind: string, status: string, in: number|null, out: number|null, n: number, workedMin: number,
   *   lateMin: number, earlyMin: number, otMin: number, otRawMin: number, otPending: boolean, holidayMin: number, holidayOtMin: number,
   *   breakMin: number, breakOverMin: number, leave: {type: string, part: number}|null, flags: string[], corrected: number, methods: string[]}} DaySummary
   */
  const otRule = (min, shift) => { const m = min - shift.otStartAfter; return m >= shift.otMinMin && m > 0 ? Math.floor(m / shift.otRound) * shift.otRound : 0; };
  /**
   * @param {Shift} shift @param {string} date @param {Punch[]} punches  this employee's punches inside the date's slice
   * @param {{tz?: number, kind?: "work"|"holiday"|"off", now?: number, leave?: {type: string, part: number}|null, otApproved?: boolean}} [opts]
   * @returns {DaySummary}
   * Rules: in = first "in" (else first "auto"), out = last "out" (else last later "auto"); lateness is counted in full from
   * the shift start once it exceeds the grace minutes (within grace = on time); the same for leaving early; OT starts at
   * the shift end (+ otStartAfter), counts only from otMinMin and is rounded down to otRound. Breaks are break_out ->
   * break_in pairs; with no recorded break the shift's unpaid break is deducted when the span is over 5 h (s.27).
   * Work on a holiday / rest day goes to holidayMin (normal hours) and holidayOtMin (beyond the normal hours).
   */
  function daySummary(shift, date, punches, opts = {}) {
    const tz = opts.tz ?? TZ, kind = opts.kind || "work", now = opts.now ?? Date.now(), w = shiftWindow(shift, date, tz);
    const ps = (punches || []).slice().sort((a, b) => a.ts - b.ts);
    /** @type {DaySummary} */
    const r = { date, kind, status: kind, in: null, out: null, n: ps.length, workedMin: 0, lateMin: 0, earlyMin: 0, otMin: 0, otRawMin: 0, otPending: false,
      holidayMin: 0, holidayOtMin: 0, breakMin: 0, breakOverMin: 0, leave: opts.leave || null, flags: [], corrected: ps.filter(p => p.corrected || p.method === "manual").length,
      methods: [...new Set(ps.map(p => p.method))] };
    const fullLeave = r.leave && r.leave.part >= 1, halfLeave = r.leave && r.leave.part < 1;
    if (!ps.length) {
      if (kind === "work") r.status = fullLeave ? "leave" : w.end < now ? "absent" : "pending";
      if (halfLeave && r.status === "absent") r.flags.push("half_leave");
      return r;
    }
    const iIn = ps.findIndex(p => p.type === "in") >= 0 ? ps.findIndex(p => p.type === "in") : ps.findIndex(p => p.type === "auto");
    if (iIn < 0) { r.status = "incomplete"; r.flags.push("missing_in"); return r; }
    let iOut = -1;
    for (let i = ps.length - 1; i > iIn; i--) if (ps[i].type === "out") { iOut = i; break; }
    if (iOut < 0) for (let i = ps.length - 1; i > iIn; i--) if (ps[i].type === "auto") { iOut = i; break; }
    r.in = ps[iIn].ts;
    if (iOut < 0) { r.status = w.to <= now ? "incomplete" : "on_duty"; if (r.status === "incomplete") r.flags.push("missing_out"); return lateOnly(r, shift, w, kind, halfLeave); }
    r.out = ps[iOut].ts;
    // breaks between in and out
    let open = null, brk = 0;
    for (let i = iIn + 1; i < iOut; i++) {
      const p = ps[i];
      if (p.type === "break_out") { if (open == null) open = p.ts; }
      else if (p.type === "break_in" && open != null) { brk += p.ts - open; open = null; }
    }
    if (open != null) { r.flags.push("missing_break_in"); brk += r.out - open; }
    const span = Math.floor((r.out - r.in) / MIN);
    r.breakMin = Math.round(brk / MIN);
    const deduct = r.breakMin > 0 ? r.breakMin : span > 300 ? Math.min(shift.breakMin, span) : 0;
    if (r.breakMin > shift.breakMin && shift.breakMin > 0) { r.breakOverMin = r.breakMin - shift.breakMin; r.flags.push("long_break"); }
    r.workedMin = Math.max(0, span - deduct);
    r.status = "present";
    if (kind !== "work") {
      const normal = shiftMinutes(shift);
      r.holidayMin = Math.min(r.workedMin, normal);
      r.holidayOtMin = otRule(r.workedMin - normal, shift);
      if (r.holidayOtMin) r.flags.push("holiday_ot");
      r.flags.push(kind === "holiday" ? "holiday_work" : "rest_day_work");
      return r;
    }
    lateOnly(r, shift, w, kind, halfLeave);
    if (!halfLeave) {
      const early = Math.floor((w.end - r.out) / MIN);
      if (early > shift.graceEarly) { r.earlyMin = early; r.flags.push("early"); }
    }
    r.otRawMin = otRule(Math.floor((r.out - w.end) / MIN), shift);
    if (r.otRawMin) {
      r.otPending = shift.otApproval && !opts.otApproved;
      r.otMin = r.otPending ? 0 : r.otRawMin;
      r.flags.push(r.otPending ? "ot_pending" : "ot");
    }
    if (halfLeave) r.flags.push("half_leave");
    return r;
  }
  function lateOnly(r, shift, w, kind, halfLeave) {
    if (kind !== "work" || halfLeave || r.in == null) return r;
    const late = Math.floor((r.in - w.start) / MIN);
    if (late > shift.graceLate) { r.lateMin = late; if (!r.flags.includes("late")) r.flags.push("late"); }
    return r;
  }

  // ---------------------------------------------------------------- holidays / leave
  // Thai public holidays. Fixed-date ones repeat every year; Buddhist holidays follow the lunar calendar, so only the
  // years listed in LUNAR are filled in — the page asks the user to check every date against the company's own
  // announcement (the employer must announce >= 13 traditional holidays a year including Labour Day, s.29).
  const FIXED = [["01-01", "newyear"], ["04-06", "chakri"], ["04-13", "songkran"], ["04-14", "songkran"], ["04-15", "songkran"],
    ["05-01", "labour"], ["05-04", "coronation"], ["06-03", "queen"], ["07-28", "king"], ["08-12", "mother"], ["10-13", "rama9"],
    ["10-23", "chula"], ["12-05", "father"], ["12-10", "constitution"], ["12-31", "nye"]];
  const LUNAR = { 2026: [["2026-03-03", "makha"], ["2026-05-31", "visakha"], ["2026-07-29", "asalha"]] };
  /** default holiday list for a year: [{date, key}] sorted; lunar dates only for years in LUNAR */
  function thaiHolidays(year) {
    const y = String(year);
    const out = FIXED.map(([md, key]) => ({ date: y + "-" + md, key })).concat((LUNAR[y] || []).map(([date, key]) => ({ date, key })));
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }
  function hasLunar(year) { return !!LUNAR[String(year)]; }
  /**
   * Holiday dates for one shift's working week: a holiday that falls on a rest day moves to the next working day that is
   * not already a holiday (s.29 substitution). @returns {Map<string, {date: string, key?: string, name?: string, sub?: string}>}
   */
  function holidayMap(holidays, workdays, substitute = true) {
    const m = new Map(), days = new Set(workdays && workdays.length ? workdays : [1, 2, 3, 4, 5]);
    const list = (holidays || []).filter(h => h && isDate(h.date)).slice().sort((a, b) => a.date.localeCompare(b.date));
    for (const h of list) m.set(h.date, h);
    if (!substitute) return m;
    for (const h of list) {
      if (days.has(weekday(h.date))) continue;
      let d = addDays(h.date, 1), guard = 0;
      while ((!days.has(weekday(d)) || m.has(d)) && guard++ < 14) d = addDays(d, 1);
      if (guard < 14) m.set(d, { date: d, key: h.key, name: h.name, sub: h.date });
    }
    return m;
  }
  /** "work" | "holiday" | "off" for a shift on a date */
  function dayKind(shift, date, hmap) { return hmap && hmap.has(date) ? "holiday" : shift.days.includes(weekday(date)) ? "work" : "off"; }
  /** leave lookup for one employee: Map date -> {type, part} (later entries win) */
  function leaveMap(leave, emp) {
    const m = new Map();
    for (const l of leave || []) if (l && l.emp === emp && isDate(l.date) && !l.removed) m.set(l.date, { type: LEAVE_TYPES.includes(l.type) ? l.type : "other", part: l.part === 0.5 ? 0.5 : 1 });
    return m;
  }

  /**
   * leave used in a calendar year per employee and type (removed entries ignored) -> Map emp -> {sick, personal, …}.
   * Statutory reference points shown next to it: sick leave paid up to 30 working days a year (s.32, s.57), personal
   * business leave >= 3 working days (s.34), annual holidays >= 6 working days after one year of service (s.30).
   */
  function leaveUsage(leave, year) {
    const y = String(year) + "-", m = new Map();
    for (const l of leave || []) {
      if (!l || l.removed || !isDate(l.date) || !l.date.startsWith(y)) continue;
      if (!m.has(l.emp)) m.set(l.emp, Object.fromEntries(LEAVE_TYPES.map(t => [t, 0])));
      const t = LEAVE_TYPES.includes(l.type) ? l.type : "other";
      m.get(l.emp)[t] += l.part === 0.5 ? 0.5 : 1;
    }
    return m;
  }
  const LEAVE_REF = { sick: 30, personal: 3, annual: 6 };

  // ---------------------------------------------------------------- SHA-256 (sync, for the audit chain and PIN hashes)
  const K = new Uint32Array([0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
  function utf8(s) { return typeof TextEncoder !== "undefined" ? new TextEncoder().encode(s) : Uint8Array.from(unescape(encodeURIComponent(s)), c => c.charCodeAt(0)); }
  /** hex SHA-256 of a string (UTF-8) */
  function sha256(str) {
    const b = utf8(String(str)), len = b.length, n = ((len + 9 + 63) >> 6) << 6, m = new Uint8Array(n);
    m.set(b); m[len] = 0x80;
    const bits = len * 8; for (let i = 0; i < 4; i++) m[n - 1 - i] = (bits / 2 ** (8 * i)) & 255;
    m[n - 5] = Math.floor(bits / 2 ** 32) & 255;
    const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]), W = new Uint32Array(64);
    const ror = (x, r) => (x >>> r) | (x << (32 - r));
    for (let o = 0; o < n; o += 64) {
      for (let i = 0; i < 16; i++) W[i] = (m[o + 4 * i] << 24) | (m[o + 4 * i + 1] << 16) | (m[o + 4 * i + 2] << 8) | m[o + 4 * i + 3];
      for (let i = 16; i < 64; i++) {
        const s0 = ror(W[i - 15], 7) ^ ror(W[i - 15], 18) ^ (W[i - 15] >>> 3), s1 = ror(W[i - 2], 17) ^ ror(W[i - 2], 19) ^ (W[i - 2] >>> 10);
        W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
      }
      let [a, b2, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (ror(e, 6) ^ ror(e, 11) ^ ror(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
        const t2 = ((ror(a, 2) ^ ror(a, 13) ^ ror(a, 22)) + ((a & b2) ^ (a & c) ^ (b2 & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b2; b2 = a; a = (t1 + t2) | 0;
      }
      H[0] += a; H[1] += b2; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
    }
    return Array.from(H, x => x.toString(16).padStart(8, "0")).join("");
  }

  // ---------------------------------------------------------------- audit log (append-only, hash-chained per device)
  /**
   * @typedef {{id: string, dev: string, seq: number, at: number, by: string, action: string, emp?: string, target?: string,
   *   before?: any, after?: any, reason: string, prev: string, hash: string}} AuditEntry
   */
  const AUDIT_ACTIONS = ["punch_add", "punch_void", "punch_edit", "leave_add", "leave_remove", "ot_approve", "holiday_add", "holiday_remove",
    "emp_add", "emp_edit", "emp_remove", "shift_edit", "settings", "purge", "import"];
  const GENESIS = "0".repeat(64);
  const canon = v => v === undefined ? "null" : JSON.stringify(v, (k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.keys(x).sort().reduce((o, kk) => (o[kk] = x[kk], o), {}) : x));
  const body = e => canon({ id: e.id, dev: e.dev, seq: e.seq, at: e.at, by: e.by, action: e.action, emp: e.emp ?? null, target: e.target ?? null, before: e.before ?? null, after: e.after ?? null, reason: e.reason });
  /** append a new entry (returns it; the log array is not mutated). Throws when who / reason is missing for a correction. */
  function auditEntry(log, e, dev, now = Date.now(), id) {
    if (!AUDIT_ACTIONS.includes(e.action)) throw new Error("unknown audit action");
    const by = String(e.by || "").trim().slice(0, 60), reason = String(e.reason || "").trim().slice(0, 200);
    if (!by) throw new Error("who made the change is required");
    if (!reason && /^(punch_|leave_|ot_)/.test(e.action)) throw new Error("a reason is required");
    const mine = (log || []).filter(x => x.dev === dev);
    const last = mine.reduce((a, x) => (!a || x.seq > a.seq ? x : a), null);
    const x = { id: id || (dev + "-" + ((last ? last.seq : 0) + 1) + "-" + now.toString(36)), dev, seq: (last ? last.seq : 0) + 1, at: now, by, action: e.action,
      emp: e.emp, target: e.target, before: e.before, after: e.after, reason, prev: last ? last.hash : GENESIS, hash: "" };
    x.hash = sha256(x.prev + "|" + body(x));
    return x;
  }
  /** verify every device's chain -> {ok, bad: ids[], truncated: devs[]} (a purged head is reported, not a failure) */
  function verifyAudit(log) {
    const by = new Map();
    for (const e of log || []) { if (!by.has(e.dev)) by.set(e.dev, []); by.get(e.dev).push(e); }
    const bad = [], truncated = [];
    for (const [dev, list] of by) {
      list.sort((a, b) => a.seq - b.seq);
      let prev = null;
      list.forEach((e, i) => {
        if (i === 0 && e.seq > 1) truncated.push(dev);
        const expPrev = i === 0 ? (e.seq === 1 ? GENESIS : e.prev) : prev;
        const okLink = e.prev === expPrev && (i === 0 || e.seq === list[i - 1].seq + 1);
        if (!okLink || sha256(e.prev + "|" + body(e)) !== e.hash) bad.push(e.id);
        prev = e.hash;
      });
    }
    return { ok: !bad.length, bad, truncated };
  }
  /**
   * effective punches: raw punches + manual additions - voids, edits applied; corrected punches are marked.
   * Raw punch records are never changed. @param {Punch[]} punches @param {AuditEntry[]} [log] @returns {Punch[]}
   */
  function applyCorrections(punches, log) {
    const m = new Map();
    for (const p of punches || []) m.set(p.id, Object.assign({}, p));
    const list = (log || []).filter(e => /^punch_/.test(e.action)).slice().sort((a, b) => a.at - b.at || (a.dev < b.dev ? -1 : a.dev > b.dev ? 1 : a.seq - b.seq));
    for (const e of list) {
      if (e.action === "punch_add" && e.after && e.after.id) m.set(e.after.id, Object.assign({}, e.after, { method: "manual", corrected: true }));
      else if (e.action === "punch_void") m.delete(e.target);
      else if (e.action === "punch_edit" && m.has(e.target) && e.after) m.set(e.target, Object.assign({}, m.get(e.target), pick(e.after, ["ts", "type"]), { corrected: true }));
    }
    return [...m.values()].sort((a, b) => a.ts - b.ts);
  }
  const pick = (o, ks) => { const r = {}; for (const k of ks) if (o[k] !== undefined) r[k] = o[k]; return r; };
  /** OT approvals from the audit log: Set of "emp|date" @param {any[]} [log] */
  function otApprovals(log) {
    const s = new Set();
    for (const e of (log || []).slice().sort((a, b) => a.at - b.at)) if (e.action === "ot_approve" && e.target) { if (e.after && e.after.approved === false) s.delete(e.target); else s.add(e.target); }
    return s;
  }

  // ---------------------------------------------------------------- month
  /**
   * @param {{emps: any[], shifts: any[], punches: Punch[], audit?: AuditEntry[], leave?: any[], holidays?: any[], month: string,
   *   tz?: number, now?: number, dept?: string, substitute?: boolean}} o
   * punches are RAW punches; corrections from the audit log are applied here.
   * @returns {{month: string, rows: any[], days: Map<string, DaySummary[]>, effective: Punch[]}}
   */
  function monthSummary(o) {
    const tz = o.tz ?? TZ, now = o.now ?? Date.now(), dates = monthDays(o.month);
    const eff = applyCorrections(o.punches, o.audit), appr = otApprovals(o.audit);
    const shifts = new Map((o.shifts || []).map(s => { const n = normShift(s); return [n.id, n]; }));
    const fallback = shifts.values().next().value || normShift({ start: "08:00", end: "17:00" });
    const byEmp = new Map();
    for (const p of eff) { if (!byEmp.has(p.emp)) byEmp.set(p.emp, []); byEmp.get(p.emp).push(p); }
    const rows = [], days = new Map();
    for (const e of o.emps || []) {
      if (o.dept && (e.dept || "") !== o.dept) continue;
      // shift history: e.shiftHist = [{from: "YYYY-MM-DD", shift}] — a shift change does not rewrite earlier days
      const hist = (Array.isArray(e.shiftHist) ? e.shiftHist : []).filter(h => h && isDate(h.from) && shifts.has(h.shift)).sort((a, b) => a.from.localeCompare(b.from));
      const shiftAt = d => { let id = hist.length ? hist[0].shift : e.shift; for (const h of hist) if (h.from <= d) id = h.shift; return shifts.get(id) || shifts.get(e.shift) || fallback; };
      const hmaps = new Map(), hmapOf = sh => { if (!hmaps.has(sh.id)) hmaps.set(sh.id, holidayMap(o.holidays, sh.days, o.substitute !== false)); return hmaps.get(sh.id); };
      const sh = shiftAt(dates[dates.length - 1]), lmap = leaveMap(o.leave, e.id);
      const slices = new Map();
      for (const p of byEmp.get(e.id) || []) { const d = shiftDateOf(p.ts, shiftAt(dateKey(p.ts, tz)), tz); if (!slices.has(d)) slices.set(d, []); slices.get(d).push(p); }
      const one = d => {
        const sd = shiftAt(d), kind = dayKind(sd, d, hmapOf(sd)), lv = kind === "work" ? lmap.get(d) || null : null;
        return daySummary(sd, d, slices.get(d) || [], { tz, kind, now, leave: lv, otApproved: appr.has(e.id + "|" + d) });
      };
      const list = dates.map(one);
      const row = { emp: e.id, code: e.code || "", name: e.name || "", dept: e.dept || "", shift: sh.name, scheduled: 0, daysWorked: 0, lateCount: 0, lateMin: 0, earlyCount: 0, earlyMin: 0,
        otMin: 0, otPendingMin: 0, holidayDays: 0, holidayMin: 0, holidayOtMin: 0, leave: Object.fromEntries(LEAVE_TYPES.map(t => [t, 0])), leaveDays: 0,
        absentDays: 0, incompleteDays: 0, corrections: 0, maxWeekOtMin: 0, weekOtOver: /** @type {string[]} */ ([]),
        maxWeekNormalMin: 0, weekNormalOver: /** @type {string[]} */ ([]), methods: { face: 0, pin: 0, qr: 0, manual: 0 } };
      for (const s of list) {
        if (s.kind === "work") row.scheduled++;
        if (s.status === "present" || s.status === "on_duty" || s.status === "incomplete") row.daysWorked++;
        if (s.kind !== "work" && s.status === "present") row.holidayDays++;
        if (s.lateMin) { row.lateCount++; row.lateMin += s.lateMin; }
        if (s.earlyMin) { row.earlyCount++; row.earlyMin += s.earlyMin; }
        row.otMin += s.otMin; if (s.otPending) row.otPendingMin += s.otRawMin;
        row.holidayMin += s.holidayMin; row.holidayOtMin += s.holidayOtMin;
        if (s.leave) { row.leave[s.leave.type] += s.leave.part; row.leaveDays += s.leave.part; }
        if (s.status === "absent") row.absentDays += s.leave && s.leave.part < 1 ? 0.5 : 1;
        if (s.status === "incomplete") row.incompleteDays++;
        row.corrections += s.corrected;
      }
      // weekly limits use whole Monday–Sunday weeks, also the days of a week that fall in the previous / next month
      const week = new Map(), wNorm = new Map(), inMonth = new Map(list.map(s => [s.date, s]));
      for (let d = weekOf(dates[0]), end = addDays(weekOf(dates[dates.length - 1]), 6); d <= end; d = addDays(d, 1)) {
        const s = inMonth.get(d) || one(d), wk = weekOf(d);
        week.set(wk, (week.get(wk) || 0) + s.otMin + s.holidayOtMin);
        wNorm.set(wk, (wNorm.get(wk) || 0) + (s.kind === "work" ? Math.max(0, s.workedMin - s.otRawMin) : 0));
      }
      for (const p of byEmp.get(e.id) || []) if (dates.includes(shiftDateOf(p.ts, shiftAt(dateKey(p.ts, tz)), tz)) && row.methods[p.method] != null) row.methods[p.method]++;
      for (const [wk, m] of week) { if (m > row.maxWeekOtMin) row.maxWeekOtMin = m; if (m > WEEK_OT_CAP_MIN) row.weekOtOver.push(wk); }
      for (const [wk, m] of wNorm) { if (m > row.maxWeekNormalMin) row.maxWeekNormalMin = m; if (m > WEEK_NORMAL_CAP_MIN) row.weekNormalOver.push(wk); }
      rows.push(row); days.set(e.id, list);
    }
    return { month: o.month, rows, days, effective: eff };
  }

  // ---------------------------------------------------------------- CSV
  /** one CSV cell: quoted, formula injection (= + - @ tab CR) neutralised */
  function csvCell(v) { let s = v == null ? "" : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; }
  const hours = m => (Math.round(m / 60 * 100) / 100).toFixed(2);
  function toCsv(rows) { return "﻿" + rows.map(r => r.map(csvCell).join(",")).join("\r\n"); }
  /** payroll CSV, one row per employee (bilingual headers so a Thai or English payroll template can map them) */
  function payrollCsv(sum) {
    const H = ["เดือน month", "รหัส code", "ชื่อ name", "แผนก department", "กะ shift", "วันทำงานตามตาราง scheduled_days", "วันมาทำงาน days_worked",
      "มาสาย(ครั้ง) late_count", "มาสาย(นาที) late_minutes", "ออกก่อน(ครั้ง) early_count", "ออกก่อน(นาที) early_leave_minutes", "OT(ชม.) ot_hours", "OT รออนุมัติ(ชม.) ot_pending_hours",
      "ทำงานวันหยุด(วัน) holiday_work_days", "ทำงานวันหยุด(ชม.) holiday_work_hours", "OT วันหยุด(ชม.) holiday_ot_hours",
      "ลาป่วย(วัน) sick_leave", "ลากิจ(วัน) personal_leave", "ลาพักร้อน(วัน) annual_leave", "ลาคลอด(วัน) maternity_leave", "ลาอื่น(วัน) other_leave", "ลารวม(วัน) leave_days",
      "ขาดงาน(วัน) absent_days", "ลงเวลาไม่ครบ(วัน) incomplete_days", "แก้ไขโดยผู้จัดการ(ครั้ง) manager_corrections", "OT สูงสุดต่อสัปดาห์(ชม.) max_week_ot_hours", "OT เกิน 36 ชม./สัปดาห์ week_ot_over_36h",
      "ชั่วโมงปกติสูงสุดต่อสัปดาห์(ชม.) max_week_normal_hours", "ชั่วโมงปกติเกิน 48 ชม./สัปดาห์ week_normal_over_48h"];
    return toCsv([H, ...sum.rows.map(r => [sum.month, r.code, r.name, r.dept, r.shift, r.scheduled, r.daysWorked, r.lateCount, r.lateMin, r.earlyCount, r.earlyMin, hours(r.otMin), hours(r.otPendingMin),
      r.holidayDays, hours(r.holidayMin), hours(r.holidayOtMin), r.leave.sick, r.leave.personal, r.leave.annual, r.leave.maternity, r.leave.other, r.leaveDays,
      r.absentDays, r.incompleteDays, r.corrections, hours(r.maxWeekOtMin), r.weekOtOver.join(" "), hours(r.maxWeekNormalMin), r.weekNormalOver.join(" ")])]);
  }
  /** daily detail CSV (one row per employee per day) — the time record kept for s.114 */
  function detailCsv(sum, tz = TZ) {
    const H = ["วันที่ date", "รหัส code", "ชื่อ name", "แผนก department", "ประเภทวัน day_type", "สถานะ status", "เข้า in", "ออก out", "ทำงาน(นาที) worked_minutes",
      "พัก(นาที) break_minutes", "สาย(นาที) late_minutes", "ออกก่อน(นาที) early_minutes", "OT(นาที) ot_minutes", "ทำงานวันหยุด(นาที) holiday_minutes", "OT วันหยุด(นาที) holiday_ot_minutes",
      "ลา leave", "วิธีลงเวลา methods", "แก้ไข corrections", "หมายเหตุ flags"];
    const out = [H];
    for (const r of sum.rows) for (const d of sum.days.get(r.emp) || []) out.push([d.date, r.code, r.name, r.dept, d.kind, d.status, d.in == null ? "" : clock(d.in, tz), d.out == null ? "" : clock(d.out, tz) + (d.out != null && dateKey(d.out, tz) !== d.date ? " (+1)" : ""),
      d.workedMin, d.breakMin, d.lateMin, d.earlyMin, d.otMin, d.holidayMin, d.holidayOtMin, d.leave ? d.leave.type + (d.leave.part < 1 ? " 0.5" : "") : "", d.methods.join(" "), d.corrected, d.flags.join(" ")]);
    return toCsv(out);
  }
  /** audit CSV (who / when / before / after / reason / hash) */
  function auditCsv(log, emps, tz = TZ) {
    const name = new Map((emps || []).map(e => [e.id, e.code + " " + e.name]));
    const f = v => v == null ? "" : typeof v !== "object" ? String(v) : canon(v.ts != null ? Object.assign({}, v, { ts: dateKey(v.ts, tz) + " " + clock(v.ts, tz) }) : v);
    return toCsv([["เวลา at", "เครื่อง device", "ลำดับ seq", "ผู้แก้ไข by", "การกระทำ action", "พนักงาน employee", "รายการ target", "ก่อน before", "หลัง after", "เหตุผล reason", "hash"],
      ...(log || []).slice().sort((a, b) => a.at - b.at).map(e => [dateKey(e.at, tz) + " " + clock(e.at, tz), e.dev, e.seq, e.by, e.action, name.get(e.emp) || e.emp || "", e.target || "", f(e.before), f(e.after), e.reason, e.hash.slice(0, 16)])]);
  }

  // ---------------------------------------------------------------- PIN / QR fallback
  /** 4–8 digits */
  function validPin(pin) { return /^\d{4,8}$/.test(String(pin || "")); }
  /** salted, iterated SHA-256 (a short PIN is a convenience check, not strong security: the kiosk also locks after 5 misses) */
  function pinHash(pin, salt, rounds = 1000) { let h = sha256(salt + ":" + pin); for (let i = 1; i < rounds; i++) h = sha256(salt + h); return h; }
  /** wrong-PIN lockout per key (employee code / kiosk): createLock({max, lockMs}) -> {fail(key, now), ok(key), locked(key, now) -> ms left} */
  function createLock({ max = 5, lockMs = 60000 } = {}) {
    const st = new Map();
    return {
      fail(k, now = Date.now()) { const s = st.get(k) || { n: 0, until: 0 }; s.n++; if (s.n >= max) { s.until = now + lockMs; s.n = 0; } st.set(k, s); return s.until > now ? s.until - now : 0; },
      ok(k) { st.delete(k); },
      locked(k, now = Date.now()) { const s = st.get(k); return s && s.until > now ? s.until - now : 0; }
    };
  }
  const CODE_RE = /^[^\u0000-\u001f\u007f<>]{1,30}$/;
  /** QR badge text: LQAT1.<code>.<token> (the code is URI-encoded so Thai codes survive) */
  function qrPayload(code, token) { return "LQAT1." + encodeURIComponent(code) + "." + token; }
  /** -> {code, token} | null */
  function parseQr(s) {
    const m = /^LQAT1\.([^.\s]{1,120})\.([A-Za-z0-9]{12,40})$/.exec(String(s || "").trim());
    if (!m) return null;
    let code; try { code = decodeURIComponent(m[1]); } catch { return null; }
    return CODE_RE.test(code) ? { code, token: m[2] } : null;
  }
  /** random token for a badge (crypto when available) */
  function newToken(len = 20) {
    const A = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789", out = [];
    const c = typeof crypto !== "undefined" && crypto.getRandomValues ? crypto.getRandomValues(new Uint8Array(len)) : Uint8Array.from({ length: len }, () => Math.floor(Math.random() * 256));
    for (let i = 0; i < len; i++) out.push(A[c[i] % A.length]);
    return out.join("");
  }

  // ---------------------------------------------------------------- punching
  /**
   * accept a punch? Repeated scans of the same person inside `gapMs` are ignored (the face loop sees a person many
   * times a second). Also flags a device clock that went backwards. -> {ok, reason?, last?}
   */
  /** @param {Punch[]} punches @param {string} emp @param {number} ts @param {{gapMs?: number, dev?: string}} [o] */
  function acceptPunch(punches, emp, ts, o = {}) {
    const gapMs = o.gapMs ?? 60000, dev = o.dev;
    let last = null, lastDev = null;
    for (const p of punches || []) { if (p.emp === emp && (!last || p.ts > last.ts)) last = p; if (dev && p.dev === dev && (!lastDev || p.ts > lastDev.ts)) lastDev = p; }
    if (last && ts >= last.ts && ts - last.ts < gapMs) return { ok: false, reason: "dup", last };
    return { ok: true, clockBack: !!(lastDev && ts < lastDev.ts - 5 * MIN), last };
  }
  /** what an "auto" punch means now: "in" (first of the shift day) or "out" */
  function autoMeaning(punches, emp, ts, shift, tz = TZ) {
    const d = shiftDateOf(ts, shift, tz);
    return (punches || []).some(p => p.emp === emp && p.ts < ts && shiftDateOf(p.ts, shift, tz) === d && (p.type === "in" || p.type === "auto")) ? "out" : "in";
  }

  // ---------------------------------------------------------------- multi-device pack (file export / import)
  const ID_RE = /^[A-Za-z0-9_.:-]{1,80}$/;
  const PACK_TOP = ["format", "v", "dev", "devName", "exportedAt", "punches", "audit", "emps"];
  const P_KEYS = ["id", "emp", "ts", "type", "method", "dev"];
  const A_KEYS = ["id", "dev", "seq", "at", "by", "action", "emp", "target", "before", "after", "reason", "prev", "hash"];
  const E_KEYS = ["id", "code", "name", "dept", "shift"];
  const str = (v, max) => typeof v === "string" && v.length <= max ? v.replace(/[\u0000-\u001f\u007f<>]/g, " ") : null;
  /**
   * strict check of an exported pack: unknown keys anywhere reject the whole pack (nothing unexpected — PIN hashes, QR
   * tokens, face data, photos — can travel between devices). -> {ok: true, pack} | {ok: false, error}
   */
  function cleanPack(raw, { maxBytes = 5e6 } = {}) {
    const bad = m => ({ ok: false, error: m });
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return bad("not an object");
    if (JSON.stringify(raw).length > maxBytes) return bad("too large");
    for (const k of Object.keys(raw)) if (!PACK_TOP.includes(k)) return bad("unknown key " + k.slice(0, 20));
    if (raw.format !== "lensiq-timeclock" || raw.v !== 1) return bad("format");
    if (typeof raw.dev !== "string" || !ID_RE.test(raw.dev)) return bad("dev");
    /** @type {{format: string, v: number, dev: string, devName: string, exportedAt: number, punches: any[], audit: any[], emps: any[]}} */
    const pack = { format: "lensiq-timeclock", v: 1, dev: raw.dev, devName: str(raw.devName || "", 40) || "", exportedAt: Number(raw.exportedAt) || 0, punches: [], audit: [], emps: [] };
    for (const p of Array.isArray(raw.punches) ? raw.punches : []) {
      if (!p || typeof p !== "object" || Object.keys(p).some(k => !P_KEYS.includes(k))) return bad("punch keys");
      if (!ID_RE.test(String(p.id)) || !ID_RE.test(String(p.emp)) || !Number.isFinite(p.ts) || p.ts < 0 || p.ts > 1e13 || !PUNCH_TYPES.includes(p.type) || !METHODS.includes(p.method)) return bad("punch");
      pack.punches.push({ id: p.id, emp: p.emp, ts: Math.round(p.ts), type: p.type, method: p.method, dev: typeof p.dev === "string" && ID_RE.test(p.dev) ? p.dev : raw.dev });
    }
    for (const a of Array.isArray(raw.audit) ? raw.audit : []) {
      if (!a || typeof a !== "object" || Object.keys(a).some(k => !A_KEYS.includes(k))) return bad("audit keys");
      if (!ID_RE.test(String(a.id)) || !ID_RE.test(String(a.dev)) || !AUDIT_ACTIONS.includes(a.action) || !Number.isInteger(a.seq) || !/^[0-9a-f]{64}$/.test(a.hash) || !/^[0-9a-f]{64}$/.test(a.prev)) return bad("audit");
      if (JSON.stringify([a.before, a.after]).length > 2000 || str(a.by, 60) == null || str(a.reason, 200) == null) return bad("audit size");
      pack.audit.push(pick(a, A_KEYS));
    }
    for (const e of Array.isArray(raw.emps) ? raw.emps : []) {
      if (!e || typeof e !== "object" || Object.keys(e).some(k => !E_KEYS.includes(k))) return bad("employee keys");
      if (!ID_RE.test(String(e.id)) || str(e.code, 30) == null || str(e.name, 80) == null) return bad("employee");
      pack.emps.push({ id: e.id, code: e.code, name: e.name, dept: str(e.dept || "", 40) || "", shift: typeof e.shift === "string" && ID_RE.test(e.shift) ? e.shift : "" });
    }
    return { ok: true, pack };
  }
  /** build the export pack (no PIN hashes, QR tokens or face data) */
  function makePack({ dev, devName, punches, audit, emps }, now = Date.now()) {
    return { format: "lensiq-timeclock", v: 1, dev, devName: devName || "", exportedAt: now,
      punches: (punches || []).map(p => pick(p, P_KEYS)), audit: (audit || []).map(a => pick(a, A_KEYS)), emps: (emps || []).map(e => pick(e, E_KEYS)) };
  }
  /** merge packs into local data (dedupe by id; employees matched by code; local employee data wins) */
  function mergePacks(local, packs) {
    const P = new Map((local.punches || []).map(p => [p.id, p])), A = new Map((local.audit || []).map(a => [a.id, a]));
    const emps = (local.emps || []).slice(), byCode = new Map(emps.map(e => [e.code, e])), idMap = new Map();
    let np = 0, na = 0, ne = 0;
    for (const pk of packs || []) {
      for (const e of pk.emps || []) {
        const have = byCode.get(e.code);
        if (have) { if (have.id !== e.id) idMap.set(e.id, have.id); continue; }
        const x = { id: e.id, code: e.code, name: e.name, dept: e.dept, shift: e.shift, imported: true }; emps.push(x); byCode.set(e.code, x); ne++;
      }
      for (const p of pk.punches || []) if (!P.has(p.id)) { P.set(p.id, Object.assign({}, p, { emp: idMap.get(p.emp) || p.emp })); np++; }
      for (const a of pk.audit || []) if (!A.has(a.id)) { A.set(a.id, a); na++; }
    }
    // remapped employee ids inside audit entries are resolved at read time by the caller via idMap
    return { punches: [...P.values()].sort((a, b) => a.ts - b.ts), audit: [...A.values()].sort((a, b) => a.at - b.at), emps, added: { punches: np, audit: na, emps: ne }, idMap };
  }

  // ---------------------------------------------------------------- retention
  /** years clamped to >= 2 (s.114) */
  function retentionYears(y) { const n = Math.round(Number(y)); return Number.isFinite(n) ? Math.max(MIN_RETENTION_YEARS, Math.min(20, n)) : MIN_RETENTION_YEARS; }
  /** cut-off epoch ms: records older than this may be deleted */
  function retentionCutoff(years, now = Date.now()) { const d = new Date(now); d.setUTCFullYear(d.getUTCFullYear() - retentionYears(years)); return d.getTime(); }
  /** drop punches / audit / leave older than the retention period -> {punches, audit, leave, removed} */
  function purge({ punches, audit, leave }, years, now = Date.now(), tz = TZ) {
    const cut = retentionCutoff(years, now), cutDate = dateKey(cut, tz);
    const p = (punches || []).filter(x => x.ts >= cut), a = (audit || []).filter(x => x.at >= cut), l = (leave || []).filter(x => x.date >= cutDate);
    return { punches: p, audit: a, leave: l, removed: (punches || []).length - p.length + (audit || []).length - a.length + (leave || []).length - l.length };
  }

  return {
    TZ, MIN, HOUR, DAY, PUNCH_TYPES, METHODS, LEAVE_TYPES, AUDIT_ACTIONS, MIN_RETENTION_YEARS, WEEK_OT_CAP_MIN, WEEK_NORMAL_CAP_MIN, SHIFT_DEFAULTS,
    hm, fmtHM, dateKey, clock, isDate, dayStart, addDays, weekday, monthDays, weekOf,
    normShift, crossesMidnight, shiftMinutes, shiftWindow, shiftDateOf, daySummary,
    thaiHolidays, hasLunar, holidayMap, dayKind, leaveMap, leaveUsage, LEAVE_REF,
    sha256, auditEntry, verifyAudit, applyCorrections, otApprovals,
    monthSummary, csvCell, payrollCsv, detailCsv, auditCsv,
    validPin, pinHash, createLock, qrPayload, parseQr, newToken, acceptPunch, autoMeaning,
    cleanPack, makePack, mergePacks, retentionYears, retentionCutoff, purge
  };
});

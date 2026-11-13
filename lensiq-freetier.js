/* lensiq-freetier.js — free-tier COUNTING on the device for the four business products (owner decision 2026-11-13).
 * Fortune and the general tools have no limit. Gate: 30-day trial, 1 lane, 100 plates per day. Attendance: up to 5
 * people. Exam: up to 5 candidates per session. Crowd: 2 hours per device per day.
 * NOT ENFORCED: ENFORCE is false, status().allowed is always true and nothing on a page is ever blocked by this file.
 * Limits apply only from a date announced at least 30 days ahead (start 30 days after the announcement); export always
 * works. Only numbers and dates are stored (localStorage "lq-ft-<product>"): no plate, name or other personal data, and
 * nothing is sent anywhere. The same numbers live in backend/src/freetier.js (tests/unit/free-tier.test.js).
 * A limit that runs on the device can be bypassed by someone who edits the code; the contract is what binds.
 *
 *   LQFreeTier.add(store, product, metric, n, nowMs)       daily counter (Bangkok day): gate "plates", crowd "seconds"
 *   LQFreeTier.setLevel(store, product, metric, v, nowMs)  current level: gate "lanes", attendance "people",
 *                                                          exam "candidates_per_session"
 *   LQFreeTier.firstUse(store, product, nowMs)             trial start (first use day; kept)
 *   LQFreeTier.status(store, product, nowMs)               {product, usage, limits, over: [limit keys], enforced: false, allowed: true}
 *   LQFreeTier.count(product, metric, n) / level(product, metric, v) / tick(product, nowMs)   page helpers on localStorage
 *   LQFreeTier.limitsStart(announcedMs), announcementOk(announcedMs, startMs), offlineValid(cache, nowMs)
 */
(function (root) {
  "use strict";
  var DAY = 86400000;
  var freeze = function (/** @type {any} */ o) { Object.keys(o).forEach(function (k) { Object.freeze(o[k]); }); return Object.freeze(o); };
  var FREE_TIERS = freeze({
    gate: { trial_days: 30, lanes: 1, plates_per_day: 100 },
    attendance: { people: 5 },
    exam: { candidates_per_session: 5 },
    crowd: { hours_per_device_per_day: 2 }
  });
  var ENFORCE = false, NOTICE_DAYS = 30, START_AFTER_DAYS = 30, OFFLINE_LICENCE_DAYS = 14;
  /** which stored metric each limit reads, and how */
  var DAILY = { gate: ["plates"], crowd: ["seconds"] };
  var LEVELS = { gate: ["lanes"], attendance: ["people"], exam: ["candidates_per_session"] };

  /** Bangkok calendar day (UTC+7, no DST) of a time in ms. @param {number} ms */
  function bkkDay(ms) { return new Date(ms + 7 * 3600000).toISOString().slice(0, 10); }
  var key = function (/** @type {string} */ p) { return "lq-ft-" + p; };
  function load(/** @type {any} */ store, /** @type {string} */ p) {
    try { var v = store.get(key(p)); return v && typeof v === "object" ? v : { v: 1 }; } catch (e) { return { v: 1 }; }
  }
  function save(/** @type {any} */ store, /** @type {string} */ p, /** @type {any} */ v) { try { store.set(key(p), v); } catch (e) { /* private mode: counting is best effort */ } }
  var okNum = function (/** @type {any} */ n) { return typeof n === "number" && isFinite(n) && n >= 0; };
  var has = function (/** @type {any} */ list, /** @type {string} */ x) { return !!list && list.indexOf(x) >= 0; };

  function add(/** @type {any} */ store, /** @type {string} */ p, /** @type {string} */ metric, /** @type {number} */ n, /** @type {number} */ nowMs) {
    if (!has(DAILY[/** @type {"gate"|"crowd"} */ (p)], metric) || !okNum(n)) return;
    var s = load(store, p), d = bkkDay(nowMs);
    if (s.day !== d) { DAILY[/** @type {"gate"|"crowd"} */ (p)].forEach(function (m) { s[m] = 0; }); s.day = d; }
    s[metric] = (Number(s[metric]) || 0) + n;
    save(store, p, s);
  }
  function setLevel(/** @type {any} */ store, /** @type {string} */ p, /** @type {string} */ metric, /** @type {number} */ v, /** @type {number} */ _nowMs) {
    if (!has(LEVELS[/** @type {"gate"|"attendance"|"exam"} */ (p)], metric) || !okNum(v)) return;
    var s = load(store, p);
    if (s[metric] === Math.floor(v)) return; // unchanged: no write
    s[metric] = Math.floor(v);
    save(store, p, s);
  }
  function firstUse(/** @type {any} */ store, /** @type {string} */ p, /** @type {number} */ nowMs) {
    if (p !== "gate") return;
    var s = load(store, p);
    if (!s.trial_start) { s.trial_start = bkkDay(nowMs); save(store, p, s); }
  }
  function status(/** @type {any} */ store, /** @type {string} */ p, /** @type {number} */ nowMs) {
    var lim = /** @type {any} */ (FREE_TIERS)[p];
    if (!lim) return null;
    var s = load(store, p), d = bkkDay(nowMs), u = /** @type {Record<string, number>} */ ({}), over = /** @type {string[]} */ ([]);
    if (p === "gate") {
      u.plates = s.day === d ? Number(s.plates) || 0 : 0;
      u.lanes = Number(s.lanes) || 0;
      u.trial_days = s.trial_start ? Math.round((Date.parse(d + "T00:00:00Z") - Date.parse(s.trial_start + "T00:00:00Z")) / DAY) + 1 : 0;
      if (u.trial_days > lim.trial_days) over.push("trial_days");
      if (u.lanes > lim.lanes) over.push("lanes");
      if (u.plates > lim.plates_per_day) over.push("plates_per_day");
    } else if (p === "attendance") {
      u.people = Number(s.people) || 0;
      if (u.people > lim.people) over.push("people");
    } else if (p === "exam") {
      u.candidates_per_session = Number(s.candidates_per_session) || 0;
      if (u.candidates_per_session > lim.candidates_per_session) over.push("candidates_per_session");
    } else if (p === "crowd") {
      u.seconds = s.day === d ? Number(s.seconds) || 0 : 0;
      if (u.seconds > lim.hours_per_device_per_day * 3600) over.push("hours_per_device_per_day");
    }
    // counting only: never blocks while ENFORCE is false
    return { product: p, usage: u, limits: lim, over: over, enforced: ENFORCE, allowed: true };
  }

  /* page helpers on localStorage (best effort; never throw) */
  var ls = {
    get: function (/** @type {string} */ k) { var v = root.localStorage.getItem(k); return v ? JSON.parse(v) : null; },
    set: function (/** @type {string} */ k, /** @type {any} */ v) { if (v == null) root.localStorage.removeItem(k); else root.localStorage.setItem(k, JSON.stringify(v)); }
  };
  function count(/** @type {string} */ p, /** @type {string} */ metric, /** @type {number} */ n) { try { add(ls, p, metric, n, Date.now()); if (p === "gate") firstUse(ls, p,
      Date.now()); } catch (e) { /* ignore */ } }
  function level(/** @type {string} */ p, /** @type {string} */ metric, /** @type {number} */ v) { try { setLevel(ls, p, metric, v, Date.now()); } catch (e) { /* ignore */ } }

  /** running time of a page (Crowd): call on every processed frame; gaps over 5 s (paused tab) are not counted; written
   *  to the device at most once a minute */
  var meters = /** @type {Record<string, {last: number, pend: number, at: number}>} */ ({});
  function tick(/** @type {string} */ p, /** @type {number} */ nowMs) {
    var m = meters[p] || (meters[p] = { last: 0, pend: 0, at: nowMs });
    if (m.last && nowMs > m.last && nowMs - m.last < 5000) m.pend += (nowMs - m.last) / 1000;
    m.last = nowMs;
    if (nowMs - m.at >= 60000 && m.pend >= 1) { count(p, "seconds", Math.round(m.pend)); m.pend = 0; m.at = nowMs; }
  }

  var limitsStart = function (/** @type {number} */ announcedMs) { return announcedMs + START_AFTER_DAYS * DAY; };
  var announcementOk = function (/** @type {number} */ a, /** @type {number} */ s) { return isFinite(a) && isFinite(s) && s - a >= NOTICE_DAYS * DAY; };
  /** A cached licence status ({checked_at, offline_until}, unix seconds) is usable offline until the earlier of its own
   *  offline_until and checked_at + 14 days (a longer value in the cache is not trusted). */
  function offlineValid(/** @type {any} */ cache, /** @type {number} */ nowMs) {
    if (!cache || !okNum(cache.checked_at) || !okNum(cache.offline_until)) return false;
    var until = Math.min(cache.offline_until, cache.checked_at + OFFLINE_LICENCE_DAYS * 86400);
    return nowMs / 1000 <= until;
  }

  root.LQFreeTier = {
    FREE_TIERS: FREE_TIERS, ENFORCE: ENFORCE, NOTICE_DAYS: NOTICE_DAYS, START_AFTER_DAYS: START_AFTER_DAYS, OFFLINE_LICENCE_DAYS: OFFLINE_LICENCE_DAYS,
    bkkDay: bkkDay, add: add, setLevel: setLevel, firstUse: firstUse, status: status, count: count, level: level, tick: tick,
    limitsStart: limitsStart, announcementOk: announcementOk, offlineValid: offlineValid
  };
})(typeof window !== "undefined" ? window : this);

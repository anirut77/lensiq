/* gate-rules.js — LQGateRules: the business rules of LENSIQ Gate, pure and unit-tested (tests/unit/gate-rules.test.js).
 * Browser: window.LQGateRules (after lensiq-plate.js) · Node: module.exports.
 *
 * PARKING (parking.html)
 *   DEFAULT_FEES · fee(entryAt, exitAt, rules, {pass, stamps:[{freeMin, discount}], lost}) ->
 *     {fee, minutes, chargeMin, units, nights, capped, rule:'free'|'pass'|'lost'|'normal', parts:[{k, amt}]}
 *     rules = {freeMin=15, freeDeduct=false, unitMin=60, rate=20, firstRate=null, graceMin=0, dailyCap=0 (0 = none),
 *              overnightAt="", overnightFee=0, lostFee=200}
 *     - stay <= freeMin + stamp minutes -> 0 ("free")      - monthly pass -> 0 ("pass")      - no entry found -> lostFee ("lost")
 *     - stamp minutes are taken off the stay; freeMin is taken off only with freeDeduct (default: first N min free, then
 *       charged from minute 0 — the usual Thai mall rule)
 *     - units = ceil((chargeMin - graceMin) / unitMin), at least 1; firstRate applies to unit 1
 *     - dailyCap caps the hourly part of every 24 h block counted from entry; each passing of overnightAt (e.g. "02:00")
 *       adds overnightFee; stamp discounts (baht) come off last; never below 0
 *   pair(events, plateKey, {match}) -> the open entry for an exit (exact key first, then look-alike match)
 *   occupancy(events) -> open entries (entered, not exited)
 *   stampMake(secret, shop, serial) / stampCheck(secret, code, shops, used) — offline shop validation codes
 *   reconcile(payments, {float, counted}) -> {cash, promptpay, exempt, stamps, lost, expectedCash, counted, diff, n}
 * VILLAGE (village.html)
 *   decide(read, {residents, deny, passes, now, autoOpen:{on, minConf, minAgree}}) ->
 *     {status:'deny'|'resident'|'visitor'|'expired'|'unknown', house, match, pass, auto:boolean, why}
 *     auto is true ONLY when the owner enabled auto-open AND the plate is an exact allow-list (resident) match AND the
 *     confidence and frame agreement reach the thresholds AND it is not on the deny list. Visitors, look-alike matches,
 *     unknown and denied plates always wait for the guard.
 *   passMake({house, plate, from, to, uses}, rand) · passValid(pass, now) · overstays(passes, events, now, graceMin)
 *   relayRequest(cfg, {gate, reason}) -> {url, method, headers, body} for Shelly Gen2 RPC (GET Switch.Set /
 *     POST /rpc) or a JSON webhook — the page sends it; manual opening is always possible and logged.
 */
(function (root, factory) {
  const P = typeof module !== "undefined" && module.exports ? require("./lensiq-plate.js") : null;
  const m = factory(P);
  if (typeof module !== "undefined" && module.exports) module.exports = m; else /** @type {any} */ (root).LQGateRules = m;
})(typeof self !== "undefined" ? self : this, function (plateMod) {
  "use strict";
  const g = /** @type {any} */ (typeof self !== "undefined" ? self : {});
  const LP = () => plateMod || g.LQPlate;
  const MIN = 60000, DAY = 86400000;
  const r2 = v => Math.round(v * 100) / 100;

  const DEFAULT_FEES = Object.freeze({ freeMin: 15, freeDeduct: false, unitMin: 60, rate: 20, firstRate: null, graceMin: 0, dailyCap: 200, overnightAt: "", overnightFee: 0, lostFee: 200 });
  function hhmm(s) { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || "")); return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null; }
  /** how many times the local clock passes hh:mm in (a, b] */
  function crossings(a, b, at) {
    const t = hhmm(at); if (t == null || !(b > a)) return 0;
    const d = new Date(a); d.setHours(0, 0, 0, 0); let c = d.getTime() + t * MIN, n = 0;
    if (c <= a) c = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() + t * MIN;
    while (c <= b) { n++; const x = new Date(c); c = new Date(x.getFullYear(), x.getMonth(), x.getDate() + 1, 0, 0, 0, 0).getTime() + t * MIN; }
    return n;
  }
  function hourly(units, R) {
    if (units <= 0) return 0;
    return R.firstRate != null && R.firstRate !== "" ? +R.firstRate + (units - 1) * R.rate : units * R.rate;
  }
  /** @param {number} entryAt @param {number} exitAt @param {any} [rules] @param {{pass?: boolean, stamps?: any[], lost?: boolean}} [o] */
  function fee(entryAt, exitAt, rules, o = {}) {
    const R = { ...DEFAULT_FEES, ...(rules || {}) };
    for (const k of ["freeMin", "unitMin", "rate", "graceMin", "dailyCap", "overnightFee", "lostFee"]) R[k] = Math.max(0, Number(R[k]) || 0);
    if (!(R.unitMin > 0)) R.unitMin = 60;
    const parts = [];
    if (o.pass) return { fee: 0, minutes: 0, chargeMin: 0, units: 0, nights: 0, capped: false, rule: "pass", parts };
    if (o.lost || !(entryAt > 0)) { parts.push({ k: "lost", amt: R.lostFee }); return { fee: r2(R.lostFee), minutes: 0, chargeMin: 0, units: 0, nights: 0, capped: false, rule: "lost", parts }; }
    const minutes = Math.max(0, Math.ceil((exitAt - entryAt) / MIN));
    const st = (o.stamps || []).filter(Boolean);
    const stampMin = st.reduce((s, x) => s + Math.max(0, +x.freeMin || 0), 0), discount = st.reduce((s, x) => s + Math.max(0, +x.discount || 0), 0);
    if (minutes <= R.freeMin + stampMin) return { fee: 0, minutes, chargeMin: 0, units: 0, nights: 0, capped: false, rule: "free", parts: stampMin ? [{ k: "stampMin", amt: 0 }] : parts };
    const chargeMin = Math.max(0, minutes - stampMin - (R.freeDeduct ? R.freeMin : 0));
    // hourly part per 24 h block from entry, each capped at dailyCap
    let total = 0, units = 0, capped = false, left = chargeMin, first = true;
    while (left > 0) {
      const blk = Math.min(left, 1440);
      let u = Math.max(1, Math.ceil(Math.max(0, blk - R.graceMin) / R.unitMin));
      if (!first) u = Math.max(1, Math.ceil(blk / R.unitMin)); // grace only once, at the first unit
      let amt = first ? hourly(u, R) : u * R.rate;
      if (R.dailyCap > 0 && amt > R.dailyCap) { amt = R.dailyCap; capped = true; }
      total += amt; units += u; left -= blk; first = false;
    }
    parts.push({ k: "hourly", amt: r2(total) });
    const nights = R.overnightFee > 0 ? crossings(entryAt, exitAt, R.overnightAt) : 0;
    if (nights) { total += nights * R.overnightFee; parts.push({ k: "overnight", amt: r2(nights * R.overnightFee) }); }
    if (discount) { parts.push({ k: "discount", amt: -r2(Math.min(total, discount)) }); total = Math.max(0, total - discount); }
    return { fee: r2(total), minutes, chargeMin, units, nights, capped, rule: "normal", parts };
  }
  /** events: [{id, kind:'ev', dir:'in'|'out', key, province, at, pairedWith?}] -> open entry for this plate (newest) */
  function occupancy(events) {
    const closed = new Set((events || []).filter(e => e.dir === "out" && e.pairedWith).map(e => e.pairedWith));
    return (events || []).filter(e => e.dir === "in" && !e.void && !closed.has(e.id)).sort((a, b) => b.at - a.at);
  }
  function pair(events, key, o = {}) {
    const open = occupancy(events);
    const exact = open.filter(e => e.key === key && (!o.province || !e.province || e.province === o.province));
    if (exact.length) return { entry: exact[0], dist: 0, alternatives: exact.slice(1) };
    const L = LP();
    if (!L) return { entry: null, dist: null, alternatives: [] };
    const m = L.match({ key, province: o.province }, open, { max: o.max == null ? 1 : o.max });
    return m.length ? { entry: m[0].item, dist: m[0].dist, alternatives: m.slice(1).map(x => x.item) } : { entry: null, dist: null, alternatives: [] };
  }

  /* ---------- shop validation (e-stamp) codes ---------- */
  const B32 = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // no 0/O/1/I: codes are read aloud and typed by guards
  function h32(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h; }
  function b32(n, len) { let s = ""; for (let i = 0; i < len; i++) { s = B32[n % 32] + s; n = Math.floor(n / 32); } return s; }
  const shopId = s => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
  /** shop code "A1" + serial -> "A1-7K3M-Q9" (serial in base 32 + a 2-char keyed check). Not a security control: a
   *  determined forger with the secret can mint codes; single use is enforced by the used-code list. */
  function stampMake(secret, shop, serial) {
    const s = shopId(shop), n = Math.max(0, Math.floor(serial)) % (32 ** 4), body = b32(n, 4);
    return `${s}-${body}-${b32(h32(String(secret) + "|" + s + "|" + body) % 1024, 2)}`;
  }
  /** -> {ok, shop, why:'format'|'shop'|'check'|'used'|''} · shops: [{id, name, freeMin, discount, active}] */
  function stampCheck(secret, code, shops, used) {
    const c = String(code || "").toUpperCase().replace(/[^A-Z0-9-]/g, "");
    const m = /^([A-Z0-9]{1,4})-([2-9A-Z]{4})-([2-9A-Z]{2})$/.exec(c);
    if (!m) return { ok: false, shop: null, code: c, why: "format" };
    const shop = (shops || []).find(s => shopId(s.id) === m[1] && s.active !== false);
    if (!shop) return { ok: false, shop: null, code: c, why: "shop" };
    if (b32(h32(String(secret) + "|" + m[1] + "|" + m[2]) % 1024, 2) !== m[3]) return { ok: false, shop, code: c, why: "check" };
    if (used && (used.has ? used.has(c) : used.includes(c))) return { ok: false, shop, code: c, why: "used" };
    return { ok: true, shop, code: c, why: "" };
  }

  /* ---------- end-of-shift reconciliation ---------- */
  /** payments: [{method:'cash'|'promptpay'|'exempt'|'pass', amount, rule, stamps:n}] · counted = cash in the drawer */
  function reconcile(payments, o = {}) {
    const P = payments || [], sum = m => r2(P.filter(p => p.method === m).reduce((s, p) => s + (+p.amount || 0), 0));
    const cash = sum("cash"), promptpay = sum("promptpay"), float = +o.float || 0;
    const expectedCash = r2(float + cash), counted = o.counted == null || o.counted === "" ? null : r2(+o.counted);
    return {
      n: P.length, cash, promptpay, total: r2(cash + promptpay),
      exempt: P.filter(p => p.method === "exempt" || p.method === "pass" || p.rule === "free").length,
      stamps: P.reduce((s, p) => s + (+p.stamps || 0), 0), lost: P.filter(p => p.rule === "lost").length,
      float, expectedCash, counted, diff: counted == null ? null : r2(counted - expectedCash)
    };
  }

  /* ---------- village ---------- */
  function passValid(p, now) { return !!p && !p.revoked && now >= (p.from || 0) && now <= (p.to || 0) && (p.uses == null || p.uses === 0 || (p.used || 0) < p.uses); }
  /**
   * read: {key, province, conf, agree} · residents: [{house, plates:[{key, province}]}] · deny: [{key, province, why}]
   * passes: [{code, house, key?, from, to, uses, used}]
   */
  function decide(read, o = {}) {
    const L = LP(), now = o.now || Date.now(), key = read && read.key;
    const base = { status: "unknown", house: "", match: null, pass: null, auto: false, why: "" };
    if (!key) return base;
    const q = { key, province: read.province || "" };
    const dn = L.match(q, o.deny || [], { max: 1 });
    if (dn.length) return { ...base, status: "deny", match: dn[0], why: dn[0].item.why || "" };
    const flat = (o.residents || []).flatMap(r => (r.plates || []).map(p => ({ ...p, house: r.house })));
    const rs = L.match(q, flat, { max: 1 });
    if (rs.length) {
      const m = rs[0], A = o.autoOpen || {};
      const minConf = Math.max(0.9, +A.minConf || 0.95), minAgree = Math.max(0.6, +A.minAgree || 0.8);
      const auto = !!A.on && m.exact && m.provinceOk !== false && (read.conf || 0) >= minConf && (read.agree == null ? 0 : read.agree) >= minAgree;
      return { ...base, status: "resident", house: m.item.house, match: m, auto, why: auto ? "auto" : A.on ? (m.exact ? "below-threshold" : "lookalike") : "manual" };
    }
    const ps = (o.passes || []).filter(p => p.key);
    const pm = L.match(q, ps, { max: 1 });
    if (pm.length) {
      const p = pm[0].item;
      return { ...base, status: passValid(p, now) ? "visitor" : "expired", house: p.house, match: pm[0], pass: p };
    }
    return base;
  }
  const PASS_ABC = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  function passMake(o, rand = Math.random) {
    let code = "V-";
    for (let i = 0; i < 6; i++) code += PASS_ABC[Math.floor(rand() * PASS_ABC.length) % PASS_ABC.length];
    const L = LP(), p = o.plate ? L.parse(o.plate) : null;
    return { code, house: String(o.house || ""), key: p && p.ok ? p.key : "", province: o.province || "", name: String(o.name || "").slice(0, 60),
      from: +o.from || Date.now(), to: +o.to || Date.now() + DAY, uses: o.uses == null ? 1 : Math.max(0, +o.uses), used: 0, at: Date.now() };
  }
  /** visitors who entered on a pass and are still inside after pass.to (+ graceMin) */
  function overstays(passes, events, now, graceMin = 15) {
    const out = [];
    for (const p of passes || []) {
      const ev = (events || []).filter(e => e.pass === p.code).sort((a, b) => a.at - b.at);
      const last = ev[ev.length - 1];
      if (last && last.dir === "in" && now > (p.to || 0) + graceMin * MIN) out.push({ pass: p, since: last.at, overMin: Math.floor((now - p.to) / MIN) });
    }
    return out;
  }
  /** cfg = {kind:'shelly-get'|'shelly-rpc'|'webhook', url, channel=0, pulseSec=1, token?} */
  function relayRequest(cfg, o = {}) {
    const c = cfg || {}, base = String(c.url || "").replace(/\/+$/, ""), ch = Math.max(0, Math.floor(+c.channel || 0)), pulse = Math.min(30, Math.max(0.2, +c.pulseSec || 1));
    if (!/^https?:\/\/[^\s/]+/i.test(base) && !/^\/[^\s]*$/.test(base)) return null;
    if (c.kind === "shelly-get") return { url: `${base}/rpc/Switch.Set?id=${ch}&on=true&toggle_after=${pulse}`, method: "GET", headers: {}, body: null };
    if (c.kind === "shelly-rpc") return { url: `${base}/rpc`, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: 1, method: "Switch.Set", params: { id: ch, on: true, toggle_after: pulse } }) };
    const h = { "Content-Type": "application/json" };
    if (c.token) h.Authorization = "Bearer " + c.token;
    return { url: base, method: "POST", headers: h, body: JSON.stringify({ event: "gate.open", gate: String(o.gate || ""), reason: String(o.reason || "guard"), at: new Date(o.at != null ? o.at : Date.now()).toISOString() }) };
  }
  return { DEFAULT_FEES, fee, crossings, hhmm, occupancy, pair, stampMake, stampCheck, reconcile, decide, passMake, passValid, overstays, relayRequest };
});

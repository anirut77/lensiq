/* lensiq-pet-draw.js — LQPetDraw: which share-card template the system gives for a pet reading (owner spec 2026-11-19).
 * Pure logic, no DOM, testable in Node. The draw is independent of the reading: the reading text never depends on the card, and
 * no card means better or worse fortune. Every draw is free; nothing counts or caps draws.
 *
 *   TEMPLATES  12 Chinese zodiac animals in branch order (rat … pig) + "secret" · ZODIAC = the 12
 *   CONFIGS    odds presets, chosen by window.LENSIQ_PET_ZODIAC_ODDS (lensiq-config.js):
 *     b (DEFAULT, owner decision 137 ข 2026-11-19)  the zodiac animal of the day (12-day branch cycle, same as
 *                  HSCore.dayPillarJDN) has double weight; the secret is 1 in 50, and 1 in 10 on full-moon days. Full moon = the
 *                  site's own "ขึ้น 15 ค่ำ" rule (lensiq-planner.js: Bangkok date of the astronomical full moon − 12 h, Meeus ch.
 *                  49), approximate ±1 day like the planner page
 *     a            12 zodiac cards equal, secret 1 in 50, no date rule (kept for comparison)
 *     No rule uses the pet's birth date (option c was removed by decision 137 ข: a typed date can be set to today).
 *     config = { id, weights: {rat … pig}, secret: probability, dayBranchFactor, fullMoonSecret: probability | null }
 *                — the 12 zodiac cards share (1 − secret) by weight
 *   odds(config, ctx) -> {p: {id: probability}, rule: "", secret, dayAnimal, fullMoon, factor}    ctx = {today: "YYYY-MM-DD"}
 *   draw(config, ctx, rand?) -> {id, rule, p}      rand() in [0, 1); default random() = crypto.getRandomValues (53 bits)
 *   oddsText(config, ctx, lang) -> [one short odds line, the INDEPENDENT line]   every number generated from odds()
 *   label(id, lang) · short(id, lang) · FROM {th, en, zh} · INDEPENDENT {th, en, zh}
 *   dayBranch(date) -> 0..11 · isFullMoonDay(date) · today(d?) -> local "YYYY-MM-DD"
 *   Collection on the device (localStorage, every access in try/catch): STORE_KEY = {"v":1,"found":{id: "YYYY-MM-DD"}} (template
 *   ids and the first-found date only)
 *     loadCollection(storage) -> {id: date} · recordFind(storage, id, today) -> {found, isNew}
 * Browser: window.LQPetDraw (loaded by petread.js only when a zodiac card is made) · Node: module.exports. */
(function (root) {
  "use strict";
  var ZODIAC = ["rat", "ox", "tiger", "rabbit", "dragon", "snake", "horse", "goat", "monkey", "rooster", "dog", "pig"];
  var TEMPLATES = ZODIAC.concat(["secret"]);
  var NAMES = {
    rat: { th: "ชวด (หนู)", en: "Rat", zh: "鼠" }, ox: { th: "ฉลู (วัว)", en: "Ox", zh: "牛" }, tiger: { th: "ขาล (เสือ)", en: "Tiger", zh: "虎" },
    rabbit: { th: "เถาะ (กระต่าย)", en: "Rabbit", zh: "兔" }, dragon: { th: "มะโรง (มังกร)", en: "Dragon", zh: "龙" },
    snake: { th: "มะเส็ง (งู)", en: "Snake", zh: "蛇" }, horse: { th: "มะเมีย (ม้า)", en: "Horse", zh: "马" }, goat: { th: "มะแม (แพะ)", en: "Goat", zh: "羊" },
    monkey: { th: "วอก (ลิง)", en: "Monkey", zh: "猴" }, rooster: { th: "ระกา (ไก่)", en: "Rooster", zh: "鸡" }, dog: { th: "จอ (หมา)", en: "Dog", zh: "狗" },
    pig: { th: "กุน (หมู)", en: "Pig", zh: "猪" }, secret: { th: "การ์ด Secret", en: "Secret Card", zh: "隐藏卡" },
  };
  var CARD = { th: "การ์ดนักษัตร · {n}", en: "Zodiac card · {n}", zh: "生肖卡 · {n}" };
  var FROM = { th: "จาก LENSIQ", en: "From LENSIQ", zh: "来自 LENSIQ" };
  var INDEPENDENT = {
    th: "การ์ดสุ่มแยกจากคำอ่าน ทุกใบมีความหมายเท่ากัน คำอ่านของน้องเหมือนเดิมไม่ว่าจะได้ใบไหน",
    en: "The card is drawn separately from the reading. Every card counts the same, and the reading stays the same whichever card comes up.",
    zh: "卡片与解读分开抽取，每张卡意义相同，无论抽到哪张，宠物的解读都不变。",
  };
  var TXT = {
    equal: { th: "โอกาสวันนี้: การ์ดนักษัตรใบละ {z} · การ์ด Secret {s}{moon}", en: "Today's odds: each zodiac card {z} · Secret Card {s}{moon}",
      zh: "今日概率：每张生肖卡 {z} · 隐藏卡 {s}{moon}" },
    day: { th: "โอกาสวันนี้: การ์ด{n} {zb} (การ์ดประจำวัน ×{f}) · ใบอื่นใบละ {z} · การ์ด Secret {s}{moon}",
      en: "Today's odds: {n} card {zb} (card of the day, ×{f}) · each other card {z} · Secret Card {s}{moon}",
      zh: "今日概率：{n}卡 {zb}（当日生肖 ×{f}）· 其他每张 {z} · 隐藏卡 {s}{moon}" },
    moon: { th: " (วันเพ็ญ)", en: " (full-moon day)", zh: "（满月日）" },
  };
  var langOf = function (l) { return l === "en" || l === "zh" ? l : "th"; };
  var fill = function (s, v) { return s.replace(/\{(\w+)\}/g, function (m, k) { return v[k] != null ? v[k] : m; }); };
  function label(id, lang) { var l = langOf(lang), n = NAMES[id]; if (!n) return ""; return id === "secret" ? n[l] : fill(CARD[l], { n: n[l] }); }
  function short(id, lang) { var n = NAMES[id]; return n ? n[langOf(lang)] : ""; }

  var equalW = function () { var w = {}; ZODIAC.forEach(function (z) { w[z] = 1; }); return w; };
  var CONFIGS = {
    a: { id: "a", weights: equalW(), secret: 1 / 50, dayBranchFactor: 1, fullMoonSecret: null },
    b: { id: "b", weights: equalW(), secret: 1 / 50, dayBranchFactor: 2, fullMoonSecret: 1 / 10 },
  };
  var DEFAULT = "b"; // owner decision 137 ข (2026-11-19)
  function config(name) { return Object.prototype.hasOwnProperty.call(CONFIGS, name) ? CONFIGS[name] : CONFIGS[DEFAULT]; }

  /* ---------- calendar (same formulas as horoscope.js / lensiq-planner.js, copied so this file stays small and standalone) ---------- */
  var DATE_RE = /^(\d{4})-(\d\d)-(\d\d)$/;
  function parse(s) {
    var m = DATE_RE.exec(String(s || "")); if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    var t = new Date(Date.UTC(y, mo - 1, d)); if (t.getUTCMonth() !== mo - 1) return null;
    return { y: y, m: mo, d: d };
  }
  function julianDay(y, m, d, h) {
    if (m <= 2) { y -= 1; m += 12; }
    var A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + (h || 0) / 24 + B - 1524.5;
  }
  function jdn(y, m, d) { return Math.floor(julianDay(y, m, d, 12)); }
  function fromJD(jd) {
    var z = Math.floor(jd + 0.5), f = jd + 0.5 - z, A = z;
    if (z >= 2299161) { var al = Math.floor((z - 1867216.25) / 36524.25); A = z + 1 + al - Math.floor(al / 4); }
    var B = A + 1524, C = Math.floor((B - 122.1) / 365.25), Dd = Math.floor(365.25 * C), E = Math.floor((B - Dd) / 30.6001);
    var d = Math.floor(B - Dd - Math.floor(30.6001 * E) + f), m = E < 14 ? E - 1 : E - 13, y = m > 2 ? C - 4716 : C - 4715;
    return { y: y, m: m, d: d };
  }
  function deltaT(year) {
    var t;
    if (year < 1900) { t = year - 1860; return 7.62 + 0.5737 * t - 0.251754 * t * t + 0.01680668 * t * t * t - 0.0004473624 * Math.pow(t, 4) + Math.pow(t, 5) / 233174; }
    if (year < 1920) { t = year - 1900; return -2.79 + 1.494119 * t - 0.0598939 * t * t + 0.0061966 * t * t * t - 0.000197 * Math.pow(t, 4); }
    if (year < 1941) { t = year - 1920; return 21.20 + 0.84493 * t - 0.076100 * t * t + 0.0020936 * t * t * t; }
    if (year < 1961) { t = year - 1950; return 29.07 + 0.407 * t - t * t / 233 + t * t * t / 2547; }
    if (year < 1986) { t = year - 1975; return 45.45 + 1.067 * t - t * t / 260 - t * t * t / 718; }
    if (year < 2005) { t = year - 2000; return 63.86 + 0.3345 * t - 0.060374 * t * t + 0.0017275 * t * t * t + 0.000651814 * Math.pow(t, 4) + 0.00002373599 * Math.pow(t, 5); }
    if (year < 2050) { t = year - 2000; return 62.92 + 0.32217 * t + 0.005589 * t * t; }
    if (year < 2150) return -20 + 32 * Math.pow((year - 1820) / 100, 2) - 0.5628 * (2150 - year);
    t = (year - 1820) / 100; return -20 + 32 * t * t;
  }
  var D2R = Math.PI / 180, sin = function (x) { return Math.sin(x * D2R); };
  /** full moon after new moon k (Meeus ch. 49, phase 0.5, main terms) -> JD (UT); same terms as lensiq-planner.js fullMoonOf */
  function fullMoonOf(k) {
    var kk = k + 0.5, T = kk / 1236.85, T2 = T * T, E = 1 - 0.002516 * T - 0.0000074 * T2;
    var M = 2.5534 + 29.1053567 * kk, Mp = 201.5643 + 385.81693528 * kk + 0.0107582 * T2, F = 160.7108 + 390.67050284 * kk - 0.0016118 * T2, Om = 124.7746 - 1.56375588 * kk;
    var jde = 2451550.09766 + 29.530588861 * kk + 0.00015437 * T2;
    jde += -0.40614 * sin(Mp) + 0.17302 * E * sin(M) + 0.01614 * sin(2 * Mp) + 0.01043 * sin(2 * F) + 0.00734 * E * sin(Mp - M) - 0.00515 * E * sin(Mp + M)
      + 0.00209 * E * E * sin(2 * M) - 0.00111 * sin(Mp - 2 * F) - 0.00057 * sin(Mp + 2 * F) + 0.00056 * E * sin(2 * Mp + M) - 0.00042 * sin(3 * Mp)
      + 0.00042 * E * sin(M + 2 * F) + 0.00038 * E * sin(M - 2 * F) - 0.00024 * E * sin(2 * Mp - M) - 0.00017 * sin(Om);
    return jde - deltaT(2000 + (jde - 2451545) / 365.25) / 86400;
  }
  /** JDN of the Bangkok date of "ขึ้น 15 ค่ำ" of lunation k: Bangkok (UTC+7) date of (full moon − 12 h) */
  function day15(k) { var f = fromJD(fullMoonOf(k) - 0.5 + 7 / 24); return jdn(f.y, f.m, f.d); }
  function isFullMoonDay(date) {
    var p = parse(date); if (!p) return false;
    var D = jdn(p.y, p.m, p.d), k = Math.round((D - 2451550.1) / 29.530588861 - 0.5);
    for (var i = k - 1; i <= k + 1; i++) if (day15(i) === D) return true;
    return false;
  }
  /** branch of the day in the sexagenary cycle: 0 = 子 rat … 11 = 亥 pig (HSCore.dayPillarJDN: branch = (JDN + 1) mod 12) */
  function dayBranch(date) { var p = parse(date); if (!p) return -1; return (((jdn(p.y, p.m, p.d) + 1) % 12) + 12) % 12; }
  function today(d) {
    var x = d instanceof Date ? d : new Date(), p = function (n) { return String(n).padStart(2, "0"); };
    return x.getFullYear() + "-" + p(x.getMonth() + 1) + "-" + p(x.getDate());
  }

  /* ---------- odds and the draw ---------- */
  function odds(cfg, ctx) {
    var c = cfg || CONFIGS[DEFAULT], x = ctx || {}, p = {}, i;
    var fm = c.fullMoonSecret != null && isFullMoonDay(x.today);
    var s = fm ? c.fullMoonSecret : c.secret;
    var br = dayBranch(x.today), dayAnimal = c.dayBranchFactor && c.dayBranchFactor !== 1 && br >= 0 ? ZODIAC[br] : "";
    var w = {}, tot = 0;
    for (i = 0; i < ZODIAC.length; i++) { var z = ZODIAC[i]; w[z] = Math.max(0, +c.weights[z] || 0) * (z === dayAnimal ? c.dayBranchFactor : 1); tot += w[z]; }
    for (i = 0; i < ZODIAC.length; i++) p[ZODIAC[i]] = tot > 0 ? (1 - s) * w[ZODIAC[i]] / tot : 0;
    p.secret = s;
    return { p: p, rule: "", secret: s, dayAnimal: dayAnimal, fullMoon: fm, factor: dayAnimal ? c.dayBranchFactor : 1 };
  }
  /** uniform in [0, 1) from 53 random bits of crypto.getRandomValues (one call per draw) */
  function random() {
    var a = new Uint32Array(2);
    (root.crypto || globalThis.crypto).getRandomValues(a);
    return (a[0] * 2097152 + (a[1] >>> 11)) / 9007199254740992;
  }
  function draw(cfg, ctx, rand) {
    var o = odds(cfg, ctx), r = (typeof rand === "function" ? rand : random)(), acc = 0, id = TEMPLATES[TEMPLATES.length - 1];
    for (var i = 0; i < TEMPLATES.length; i++) {
      acc += o.p[TEMPLATES[i]];
      if (o.p[TEMPLATES[i]] > 0 && r < acc) { id = TEMPLATES[i]; break; }
    }
    return { id: id, rule: o.rule, p: o.p };
  }
  var pct = function (x) { return (Math.round(x * 10000) / 100).toFixed(2).replace(/\.?0+$/, "") + "%"; };
  /** one short line generated from the active config (+ the INDEPENDENT line) */
  function oddsText(cfg, ctx, lang) {
    var l = langOf(lang), o = odds(cfg || CONFIGS[DEFAULT], ctx), moon = o.fullMoon ? TXT.moon[l] : "", line;
    var others = ZODIAC.filter(function (z) { return z !== o.dayAnimal; });
    var vals = others.map(function (z) { return o.p[z]; }), same = vals.every(function (v) { return Math.abs(v - vals[0]) < 1e-12; });
    if (o.dayAnimal && same) line = fill(TXT.day[l], { n: short(o.dayAnimal, l), zb: pct(o.p[o.dayAnimal]), f: o.factor, z: pct(vals[0]), s: pct(o.p.secret), moon: moon });
    else if (same) line = fill(TXT.equal[l], { z: pct(vals[0]), s: pct(o.p.secret), moon: moon });
    else line = ZODIAC.map(function (z) { return short(z, l) + " " + pct(o.p[z]); }).join(" · ") + " · " + NAMES.secret[l] + " " + pct(o.p.secret) + moon;
    return [line, INDEPENDENT[l]];
  }

  /* ---------- the collection on this device ---------- */
  var STORE_KEY = "lq-pet-zodiac-v1";
  function get(st, k) { try { return st && typeof st.getItem === "function" ? st.getItem(k) : null; } catch (e) { return null; } }
  function set(st, k, v) { try { if (st && typeof st.setItem === "function") st.setItem(k, v); return true; } catch (e) { return false; } }
  function loadCollection(st) {
    var out = {}, raw = get(st, STORE_KEY), j;
    if (!raw) return out;
    try { j = JSON.parse(raw); } catch (e) { return out; }
    var f = j && typeof j === "object" && j.found && typeof j.found === "object" ? j.found : {};
    for (var i = 0; i < TEMPLATES.length; i++) { var id = TEMPLATES[i]; if (typeof f[id] === "string" && parse(f[id])) out[id] = f[id]; }
    return out;
  }
  function recordFind(st, id, day) {
    var found = loadCollection(st);
    if (TEMPLATES.indexOf(id) < 0 || !parse(day)) return { found: found, isNew: false };
    var isNew = !found[id];
    if (isNew) { found[id] = day; set(st, STORE_KEY, JSON.stringify({ v: 1, found: found })); }
    return { found: found, isNew: isNew };
  }

  var api = { ZODIAC: ZODIAC, TEMPLATES: TEMPLATES, NAMES: NAMES, CONFIGS: CONFIGS, DEFAULT: DEFAULT, FROM: FROM, INDEPENDENT: INDEPENDENT,
    STORE_KEY: STORE_KEY, config: config, label: label, short: short, odds: odds, draw: draw, random: random, oddsText: oddsText,
    dayBranch: dayBranch, isFullMoonDay: isFullMoonDay, today: today, loadCollection: loadCollection, recordFind: recordFind };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LQPetDraw = api;
})(typeof window !== "undefined" ? window : globalThis);

/* compat.js — Compatibility (ดวงสมพงษ์): two people or a group of 3–8, four traditions computed on the device.
 * Owner order 2026-11-16 part A. Locked tests (written before this file): tests/unit/fortune-compat.test.js,
 * tests/e2e/fortune-compat.e2e.mjs, tests/e2e/fortune-compat-webkit.e2e.mjs (evals-locks/fortune-compat.sha256).
 * Methods and sources (docs/COMPAT-RESEARCH.md, docs/COMPAT-SOURCES.md):
 *   thai     day-of-birth pairs (คู่มิตร / ศัตรู / สมพล / ธาตุ, th.wikipedia โหราศาสตร์ไทย, baankhunyai.com), year animals
 *            (six harmony, three harmony, clash, harm, punishment; sanook.com), birth-year elements of ตำราพรหมชาติ (sanook.com)
 *   bazi     Day Master element cycle, five stem combinations and stem clashes, day / year branch relations (zh.wikipedia 天干 地支)
 *   vedic    Ashtakoota out of 30 (seven kootas; Gana left out, owner decision 72) from the sidereal Moon (Lahiri ayanamsa, IAE values): "common" tables (hindutone.com,
 *            dekhopanchang.com, astroyogi.com, onlinejyotish.com); cancellations are reported, never added to the raw score
 *   western  synastry: five major aspects between Sun … Saturn of the two charts (orbs 8° luminaries / 6° / 4° sextile)
 * The site's own engines do the calendar work (horoscope.js: Thai day from sunrise, BaZi pillars, year animals; astro.js:
 * Moon, Meeus ch. 47, within 0.72′ of astronomy-engine 1900–2100). Planets come from astronomy-engine 2.1.19 (MIT,
 * vendor/astronomy-engine), loaded on demand by the page. Nothing is sent or stored: no network call, no storage.
 * Scores are a guide shown only together with the detail of each category; the wording is always how to make it work. */
(function (root) {
  "use strict";
  const isNode = typeof module !== "undefined" && module.exports && typeof require === "function";
  const HS = root.HSCore || (isNode ? require("./horoscope.js") : null);
  const AS = root.Astro || (isNode ? require("./astro.js") : null);
  const KB = root.LQCompatKB || (isNode ? require("./compat-kb.js") : null);
  const CATEGORIES = ["communication", "values", "money", "daily", "work", "decisions", "longterm"];
  const FREE_CATEGORIES = ["communication", "values"];
  const METHODS = ["thai", "bazi", "vedic", "western"];
  const norm = x => ((x % 360) + 360) % 360;
  const sep = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
  const has = (arr, a, b) => arr.some(p => (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a));

  /* ================= Thai ================= */
  // planet numbers 1 Sun … 7 Saturday, 8 Rahu (Wednesday night)
  const T_MITR = [[1, 5], [2, 4], [3, 6], [7, 8]], T_SATRU = [[1, 3], [2, 5], [4, 8], [6, 7]], T_SOMPHON = [[1, 6], [2, 8], [3, 5], [4, 7]], T_THATU = [[1, 7], [2, 5], [3, 8], [4, 6]];
  const DAY_EL = [null, "fire", "earth", "wind", "water", "earth", "water", "fire", "wind"];
  const thai = {
    dayPair(a, b) {
      const kinds = [];
      if (has(T_MITR, a, b)) kinds.push("mitr");
      if (has(T_SATRU, a, b)) kinds.push("satru");
      if (has(T_SOMPHON, a, b)) kinds.push("somphon");
      if (has(T_THATU, a, b)) kinds.push("thatu");
      return { kinds, same: a === b };
    },
    dayElement: n => DAY_EL[n],
    // ตำราพรหมชาติ (sanook.com/horoscope/229037): six year elements
    yearElement: an => ["water", "earth", "wood", "wood", "gold", "fire", "fire", "gold", "iron", "iron", "earth", "water"][an],
    yearElementRel(a, b) {
      const x = thai.yearElement(a), y = thai.yearElement(b), k = [x, y].sort().join("+");
      if (x === "gold" && y === "gold") return "unstated";
      if (x === "gold" || y === "gold") return "good";
      const GOOD = ["water+water", "water+wood", "earth+water", "iron+water", "earth+earth", "earth+iron", "earth+fire", "earth+wood", "wood+wood"];
      if (GOOD.includes(k)) return "good";
      if (k === "fire+water") return "mixed";
      if (["fire+wood", "fire+fire", "fire+iron", "iron+iron"].includes(k)) return "care";
      return "unstated";
    },
  };

  /* ================= BaZi ================= */
  const STEM_EL = ["wood", "wood", "fire", "fire", "earth", "earth", "metal", "metal", "water", "water"];
  const GEN = { wood: "fire", fire: "earth", earth: "metal", metal: "water", water: "wood" };
  const CTRL = { wood: "earth", earth: "water", water: "fire", fire: "metal", metal: "wood" };
  const COMBO = [[0, 5, "earth"], [1, 6, "metal"], [2, 7, "water"], [3, 8, "wood"], [4, 9, "fire"]];
  const SCLASH = [[0, 6], [1, 7], [2, 8], [3, 9]];
  const SIX = [[0, 1], [2, 11], [3, 10], [4, 9], [5, 8], [6, 7]];
  const THREE = [[8, 0, 4], [11, 3, 7], [2, 6, 10], [5, 9, 1]];
  const DIR = [[11, 0, 1], [2, 3, 4], [5, 6, 7], [8, 9, 10]];
  const PUNISH = [[2, 5], [5, 8], [2, 8], [1, 10], [10, 7], [1, 7], [0, 3]];
  const SELF = [4, 6, 9, 11];
  const HARM = [[0, 7], [1, 6], [2, 5], [3, 4], [8, 11], [9, 10]];
  const DESTROY = [[0, 9], [6, 3], [5, 8], [2, 11], [4, 1], [10, 7]];
  const bazi = {
    stemRel(a, b) {
      const x = STEM_EL[a], y = STEM_EL[b];
      const rel = x === y ? "same" : GEN[x] === y ? "aGen" : GEN[y] === x ? "bGen" : CTRL[x] === y ? "aCtrl" : "bCtrl";
      const c = COMBO.find(p => (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a));
      return { rel, combo: c ? c[2] : null, clash: has(SCLASH, a, b) };
    },
    branchRels(a, b) {
      const out = [];
      if (a === b) { out.push("same"); if (SELF.includes(a)) out.push("punish"); return out; }
      if (has(SIX, a, b)) out.push("six");
      if (THREE.some(g => g.includes(a) && g.includes(b))) out.push("three");
      if (DIR.some(g => g.includes(a) && g.includes(b))) out.push("dir");
      if ((a - b + 12) % 12 === 6) out.push("clash");
      if (has(PUNISH, a, b)) out.push("punish");
      if (has(HARM, a, b)) out.push("harm");
      if (has(DESTROY, a, b)) out.push("destroy");
      return out;
    },
    STEM_EL,
  };

  /* ================= Vedic (Ashtakoota, "common" profile) ================= */
  const VARNA = [1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0];                    // 0 Brahmin (highest) … 3 Shudra; by element of the sign
  const VG = { C: 0, M: 1, J: 2, V: 3, K: 4 };                             // quadruped, human, water, wild, insect
  const vashyaOf = (r, deg) => r === 8 ? (deg < 15 ? VG.M : VG.C) : r === 9 ? (deg < 15 ? VG.C : VG.J) : [VG.C, VG.C, VG.M, VG.J, VG.V, VG.M, VG.M, VG.K, 0, 0, VG.M, VG.J][r];
  const VASHYA = [[2, 1, 1, 1.5, 1], [1, 2, 1.5, 0, 1], [1, 1.5, 2, 1, 1], [0, 0, 0, 2, 0], [1, 1, 1, 0, 2]]; // row = first (bride), col = second
  /* Yoni, derived from the classical rule (review round 1, D1: no table copied from any GPL / AGPL source). Animals:
     0 Horse 1 Elephant 2 Sheep/Goat 3 Serpent 4 Dog 5 Cat 6 Rat/Mouse 7 Cow 8 Buffalo 9 Tiger 10 Deer 11 Monkey 12 Mongoose 13 Lion.
     Animal per nakshatra and the scale (same 4, friendly 3, neutral 2, hostile 1, sworn enemy 0) and the 7 sworn-enemy pairs:
     onlinejyotish.com/articles/marriage-matching/english/yoni-kootam.php, checked against B.V. Raman, Muhurtha or Electional
     Astrology, pp. 82-84 (owner decision 72: two independent sources per cell). Only two levels are backed twice: the same animal
     (4) and the sworn-enemy pairs (0); which pairs are "friendly" has one source only and Monkey-Cat is disputed (Raman: hostile;
     aaps.space: friendly), so every other pair is 2. Derivation per cell: docs/COMPAT-SOURCES.md §3a. */
  const YONI_OF = [0, 1, 2, 3, 3, 4, 5, 2, 5, 6, 6, 7, 8, 9, 8, 9, 10, 10, 4, 11, 12, 11, 13, 0, 13, 7, 1];
  const Y_SWORN = [[0, 8], [1, 13], [2, 11], [3, 12], [4, 10], [5, 6], [7, 9]];
  const yoniScore = (a, b) => (a === b ? 4 : has(Y_SWORN, a, b) ? 0 : 2);
  const LORD = [2, 5, 3, 1, 0, 3, 5, 2, 4, 6, 6, 4];                      // planets: 0 Su 1 Mo 2 Ma 3 Me 4 Ju 5 Ve 6 Sa
  /* Graha Maitri, derived from Parashara's natural friendships (Brihat Parashara Hora Shastra ch. 3; table as given on
     hindutone.com / dekhopanchang.com) with the scale friend+friend 5, friend+neutral 4, neutral+neutral 3, friend+enemy 1,
     neutral+enemy 0.5, enemy+enemy 0, same lord 5 (hindutone.com, dekhopanchang.com) */
  const FRIENDS = [[1, 2, 4], [0, 3], [0, 1, 4], [0, 5], [0, 1, 2], [3, 6], [3, 5]]; // Parashara natural friends
  const ENEMIES = [[5, 6], [], [3], [1], [3, 5], [0, 1], [0, 1, 2]];                  // the rest are neutral
  const view = (a, b) => (FRIENDS[a].includes(b) ? "F" : ENEMIES[a].includes(b) ? "E" : "N");
  const M_SCALE = { FF: 5, FN: 4, NN: 3, EF: 1, EN: 0.5, EE: 0 };
  const maitriScore = (a, b) => (a === b ? 5 : M_SCALE[[view(a, b), view(b, a)].sort().join("")]);
  // Gana (6 points) is left out (owner decision 72): no two independent sources agree on its mixed cells (COMPAT-SOURCES §3c)
  const NADI_OF = [0, 1, 2, 2, 1, 0, 0, 1, 2, 2, 1, 0, 0, 1, 2, 2, 1, 0, 0, 1, 2, 2, 1, 0, 0, 1, 2];
  const NAK_SPAN = 360 / 27;
  const vedic = {
    nakshatra(lon) {
      const L = norm(lon), nak = Math.min(26, Math.floor(L / NAK_SPAN));
      return { nak, pada: Math.min(4, Math.floor((L - nak * NAK_SPAN) / (NAK_SPAN / 4)) + 1), rashi: Math.floor(L / 30), deg: L % 30, lon: L };
    },
    /** Lahiri (Chitrapaksha) mean ayanamsa, IAE: 23°51′25.53″ at J2000 + IAE 1989 general precession */
    ayanamsa(jd) { const t = (jd - 2451545) / 36525; return 23.857092 + (5029.0966 * t + 1.11161 * t * t) / 3600; },
    /** first = the person the tradition counts first (bride), second = groom; {nak 0..26, rashi 0..11, deg} */
    ashtakoota(first, second) {
      const b = first, g = second;
      const varna = VARNA[g.rashi] <= VARNA[b.rashi] ? 1 : 0;
      const vashya = VASHYA[vashyaOf(b.rashi, b.deg == null ? 0 : b.deg)][vashyaOf(g.rashi, g.deg == null ? 0 : g.deg)];
      const taraOk = (x, y) => { const c = ((y - x + 27) % 27) + 1, r = c % 9 || 9; return [3, 5, 7].includes(r) ? 0 : 1.5; };
      const tara = taraOk(b.nak, g.nak) + taraOk(g.nak, b.nak);
      const yoni = yoniScore(YONI_OF[b.nak], YONI_OF[g.nak]);
      const lb = LORD[b.rashi], lg = LORD[g.rashi];
      const maitri = maitriScore(lb, lg);
      const d = ((g.rashi - b.rashi + 12) % 12) + 1;
      const bhakoot = [2, 12, 5, 9, 6, 8].includes(d) ? 0 : 7;
      const nadi = NADI_OF[b.nak] === NADI_OF[g.nak] ? 0 : 8;
      const friends = FRIENDS[lb].includes(lg) && FRIENDS[lg].includes(lb);
      const cancel = {
        bhakoot: bhakoot === 0 && (lb === lg || ([6, 8].includes(d) ? friends : (FRIENDS[lb].includes(lg) || FRIENDS[lg].includes(lb)))),
        nadi: nadi === 0 && ((b.rashi === g.rashi && b.nak !== g.nak) || (b.nak === g.nak && b.rashi !== g.rashi)),
      };
      const kootas = { varna, vashya, tara, yoni, maitri, bhakoot, nadi };
      const total = Object.values(kootas).reduce((s, v) => s + v, 0);
      return { kootas, total, max: 30, cancel, dist: [d, ((b.rashi - g.rashi + 12) % 12) + 1] };
    },
    MAX: { varna: 1, vashya: 2, tara: 3, yoni: 4, maitri: 5, bhakoot: 7, nadi: 8 },
    yoniScore, maitriScore, YONI_OF,
  };

  /* ================= Western ================= */
  const BODIES = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn"];
  const AE_NAME = { mercury: "Mercury", venus: "Venus", mars: "Mars", jupiter: "Jupiter", saturn: "Saturn" };
  /** @type {Array<[string, number]>} */
  const ASPECTS = [["conj", 0], ["sext", 60], ["square", 90], ["trine", 120], ["opp", 180]];
  const western = {
    /** major aspect between two longitudes: orb 8° with the Sun or Moon, 6° otherwise, 4° for the sextile */
    aspect(a, b, pa, pb) {
      const d = sep(a, b), lum = ["sun", "moon"].includes(pa) || ["sun", "moon"].includes(pb);
      for (const [type, ang] of ASPECTS) {
        const max = type === "sext" ? 4 : lum ? 8 : 6, orb = Math.abs(d - ang);
        if (orb <= max + 1e-9) return { type, orb, max };
      }
      return null;
    },
    /** tropical geocentric longitudes (true ecliptic of date) at jd (UT) with astronomy-engine */
    planets(jd, A) {
      const t = A.MakeTime(jd - 2451545), out = {};
      out.sun = norm(A.SunPosition(t).elon);
      out.moon = norm(A.EclipticGeoMoon(t).lon);
      for (const k of ["mercury", "venus", "mars", "jupiter", "saturn"]) out[k] = norm(A.Ecliptic(A.GeoVector(AE_NAME[k], t, true)).elon);
      return out;
    },
    BODIES,
  };

  /* ================= person ================= */
  function person(inp, opts) {
    inp = inp || {}; opts = opts || {};
    const tz = inp.tz == null ? 7 : inp.tz, time = inp.time && Number.isFinite(inp.time.h) ? inp.time : null;
    const P = HS.analyze({ y: inp.y, m: inp.m, d: inp.d, time, tz });
    const jdAt = h => HS.julianDay(inp.y, inp.m, inp.d, h) - tz / 24;
    const jd = time ? jdAt(time.h + (time.mi || 0) / 60) : jdAt(12);
    const A = opts.astronomy && typeof opts.astronomy.EclipticGeoMoon === "function" ? opts.astronomy : null;
    const moonTrop = j => (A ? norm(A.EclipticGeoMoon(A.MakeTime(j - 2451545)).lon) : AS.moonAt(j).lon);
    const nut = j => { const T = (j - 2451545) / 36525, om = (125.04452 - 1934.136261 * T) * Math.PI / 180; return -17.2 * Math.sin(om) / 3600; };
    const sid = j => norm(moonTrop(j) - vedic.ayanamsa(j) - nut(j));
    const v = vedic.nakshatra(sid(jd));
    let alt = null;
    if (!time) { const a0 = vedic.nakshatra(sid(jdAt(0))), a1 = vedic.nakshatra(sid(jdAt(23.99))); if (a0.nak !== a1.nak) alt = [a0.nak, a1.nak]; }
    const day = P.thaiDay.planet + 1;
    return {
      input: { y: inp.y, m: inp.m, d: inp.d, time, tz }, timeKnown: !!time, jd,
      thai: { day, element: DAY_EL[day], animal: P.zodiac.thai.animal, yearEl: thai.yearElement(P.zodiac.thai.animal) },
      bazi: { dayStem: P.bazi.day.stem, dayBranch: P.bazi.day.branch, yearBranch: P.bazi.year.branch, dmEl: STEM_EL[P.bazi.day.stem] },
      vedic: Object.assign(v, { uncertain: !!alt, alt }),
      western: A ? { planets: western.planets(jd, A), timeKnown: !!time } : null,
    };
  }

  /* ================= signals: what each method says, per category ================= */
  // sig: { m, id, cats, pol: fit|care, w, v: {vars}, step? }
  const BR_W = { six: 2, three: 1.5, dir: 1, clash: 2, harm: 1.5, punish: 1.5, destroy: 1 };
  const BR_GOOD = ["six", "three", "dir"], BR_CARE = ["clash", "punish", "harm", "destroy"];
  function thaiSignals(A, B) {
    const out = [], dp = thai.dayPair(A.thai.day, B.thai.day), dc = ["communication", "daily", "decisions"];
    const dv = { x: { day: A.thai.day }, y: { day: B.thai.day } };
    if (dp.same) out.push({ m: "thai", id: "thai.day.same", cats: dc, pol: "fit", w: 1, v: { x: { day: A.thai.day } } });
    for (const k of dp.kinds) {
      if (k === "satru") out.push({ m: "thai", id: "thai.day.satru", cats: dc, pol: "care", w: dp.kinds.includes("thatu") ? 1 : 2, v: dv });
      else out.push({ m: "thai", id: "thai.day." + k, cats: k === "thatu" ? dc.concat(["work"]) : dc, pol: "fit", w: { mitr: 2, thatu: 1.5, somphon: 1 }[k], v: Object.assign({ el: { el4: DAY_EL[A.thai.day] } }, dv) });
    }
    const yr = bazi.branchRels(A.thai.animal, B.thai.animal), yc = ["longterm", "values", "daily"], yv = { x: { animal: A.thai.animal }, y: { animal: B.thai.animal } };
    if (yr.includes("same")) out.push({ m: "thai", id: "thai.year.same", cats: yc, pol: "fit", w: 0.5, v: { x: { animal: A.thai.animal } } });
    for (const k of ["six", "three"]) if (yr.includes(k)) out.push({ m: "thai", id: "thai.year." + k, cats: yc, pol: "fit", w: BR_W[k], v: yv });
    for (const k of ["clash", "punish", "harm"]) if (yr.includes(k) && !(k === "punish" && yr.includes("same"))) out.push({ m: "thai", id: "thai.year." + k, cats: yc, pol: "care", w: k === "clash" ? 2 : 1, v: yv });
    const ye = thai.yearElementRel(A.thai.animal, B.thai.animal), ev = { x: { yel: A.thai.yearEl }, y: { yel: B.thai.yearEl } };
    if (ye === "good") out.push({ m: "thai", id: "thai.yel.good", cats: ["money", "longterm"], pol: "fit", w: 1.5, v: ev });
    if (ye === "mixed") out.push({ m: "thai", id: "thai.yel.mixed", cats: ["money", "longterm"], pol: "care", w: 0.75, v: ev });
    if (ye === "care") out.push({ m: "thai", id: "thai.yel.care", cats: ["money", "longterm"], pol: "care", w: 1.5, v: ev });
    return { out, facts: { dp, yr, ye } };
  }
  function baziSignals(A, B) {
    const out = [], sr = bazi.stemRel(A.bazi.dayStem, B.bazi.dayStem), ea = A.bazi.dmEl, eb = B.bazi.dmEl;
    if (sr.rel === "same") out.push({ m: "bazi", id: "bazi.dm.same", cats: ["communication", "work"], pol: "fit", w: 1, v: { x: { el5: ea } } });
    else if (sr.rel === "aGen" || sr.rel === "bGen") {
      const f = sr.rel === "aGen";
      out.push({ m: "bazi", id: "bazi.dm.gen", cats: ["communication", "work", "decisions"], pol: "fit", w: 1.5, swap: !f, v: { x: { el5: f ? ea : eb }, y: { el5: f ? eb : ea } } });
    } else {
      const f = sr.rel === "aCtrl";
      out.push({ m: "bazi", id: "bazi.dm.ctrl", cats: ["decisions", "communication", "money"], pol: "care", w: 1, swap: !f, v: { x: { el5: f ? ea : eb }, y: { el5: f ? eb : ea } } });
    }
    const sv = { x: { stem: A.bazi.dayStem }, y: { stem: B.bazi.dayStem } };
    if (sr.combo) out.push({ m: "bazi", id: "bazi.combo", cats: ["values", "longterm", "decisions"], pol: "fit", w: 2, v: Object.assign({ el: { el5: sr.combo } }, sv) });
    if (sr.clash) out.push({ m: "bazi", id: "bazi.stemClash", cats: ["decisions", "communication"], pol: "care", w: 2, v: sv });
    const br = (where, a, b, cats, k) => {
      const rels = bazi.branchRels(a, b), v = { x: { branch: a }, y: { branch: b } };
      const good = BR_GOOD.find(r => rels.includes(r)), bad = BR_CARE.filter(r => rels.includes(r) && !(r === "punish" && a === b));
      if (good) out.push({ m: "bazi", id: "bazi.br.good", cats, pol: "fit", w: BR_W[good] * k, v, where, rel: good });
      if (rels.includes("same") && SELF.includes(a)) out.push({ m: "bazi", id: "bazi.br.care", cats, pol: "care", w: 0.75 * k, v, where, rel: "punish" });
      for (const r of bad.slice(0, 2)) out.push({ m: "bazi", id: "bazi.br.care", cats, pol: "care", w: BR_W[r] * k * (good ? 0.5 : 1), v, where, rel: r });
      return rels;
    };
    const day = br("day", A.bazi.dayBranch, B.bazi.dayBranch, ["daily", "longterm"], 1);
    const year = br("year", A.bazi.yearBranch, B.bazi.yearBranch, ["values", "longterm"], 0.6);
    return { out, facts: { sr, day, year } };
  }
  const K_CATS = { varna: ["values", "work"], vashya: ["decisions", "communication"], tara: ["longterm", "daily"], yoni: ["daily"], maitri: ["communication", "values"],
    bhakoot: ["money", "longterm"], nadi: ["longterm", "daily"] };
  function vedicSignals(A, B) {
    const ab = vedic.ashtakoota(A.vedic, B.vedic), ba = vedic.ashtakoota(B.vedic, A.vedic), out = [];
    for (const k of Object.keys(vedic.MAX)) {
      const max = vedic.MAX[k], p = (ab.kootas[k] + ba.kootas[k]) / 2, r = p / max, w = max / 4;
      const cancelled = (k === "bhakoot" && (ab.cancel.bhakoot || ba.cancel.bhakoot)) || (k === "nadi" && (ab.cancel.nadi || ba.cancel.nadi));
      if (r >= 0.6) out.push({ m: "vedic", id: "vedic." + k, cats: K_CATS[k], pol: "fit", w, v: { k: { koota: k }, p, m: max } });
      else if (r <= 0.34) out.push({ m: "vedic", id: "vedic." + k, cats: K_CATS[k], pol: "care", w: cancelled ? w / 2 : w, v: { k: { koota: k }, p, m: max, d: ab.dist.join("/") } });
    }
    return { out, facts: { ab, ba } };
  }
  const P_THEME = (p, q) => {
    const s = [p, q];
    if (s.includes("saturn")) return "structure";
    if (s.includes("jupiter")) return "growth";
    if (s.includes("mercury")) return "mind";
    if (p === "sun" && q === "sun") return "sunsun";
    if (p === "moon" && q === "moon") return "moonmoon";
    if (s.includes("sun") && s.includes("moon")) return "lum";
    if (s.includes("venus") || (s.includes("mars") && s.includes("moon"))) return "love";
    return "drive";
  };
  /** @type {Record<string, [number, string[]]>} */
  const THEME = { lum: [3, ["daily", "longterm"]], moonmoon: [2, ["daily"]], sunsun: [1.5, ["values", "work"]], mind: [2.5, ["communication", "decisions"]],
    love: [2.5, ["daily", "values"]], drive: [1.5, ["work", "decisions"]], growth: [1.5, ["longterm", "money"]], structure: [2, ["longterm", "work", "money"]] };
  function westernSignals(A, B) {
    if (!A.western || !B.western) return { out: [], facts: null, off: true };
    const out = [], asp = [];
    for (const p of BODIES) for (const q of BODIES) {
      if (["jupiter", "saturn"].includes(p) && ["jupiter", "saturn"].includes(q)) continue; // generational
      const a = western.aspect(A.western.planets[p], B.western.planets[q], p, q);
      if (!a) continue;
      const th = P_THEME(p, q), base = /** @type {number} */ (THEME[th][0]);
      let w = base * (1 - 0.5 * a.orb / a.max);
      if ((p === "moon" && !A.timeKnown) || (q === "moon" && !B.timeKnown)) w /= 2;
      const pol = a.type === "trine" || a.type === "sext" ? "fit" : a.type === "conj" ? (th === "structure" || th === "drive" ? "mixed" : "fit") : "care";
      asp.push({ p, q, type: a.type, orb: a.orb, w, pol });
      if (pol === "mixed") continue;
      out.push({ m: "western", id: "west." + th, cats: THEME[th][1], pol, w, v: { pa: { planet: p }, pb: { planet: q }, asp: { aspect: a.type } } });
    }
    asp.sort((x, y) => y.w - x.w);
    return { out, facts: { asp, noTime: !A.timeKnown || !B.timeKnown } };
  }

  const LEAN_VAL = { fit: 1, mixed: 0.5, care: 0 };
  function leanOf(sigs) {
    let s = 0;
    for (const g of sigs) s += g.pol === "fit" ? g.w : -g.w;
    return s >= 0.75 ? "fit" : s <= -0.75 ? "care" : "mixed";
  }
  function scoreOf(sigs) {
    let f = 0, c = 0;
    for (const g of sigs) { if (g.pol === "fit") f += g.w; else c += g.w; }
    return Math.max(10, Math.min(95, Math.round(55 + 7 * (f - c))));
  }

  /* ================= pair ================= */
  /* owner and pet: the interface the pet page uses (branch fortune-pet, lensiq-compat-stub.js):
     pair({birth: "YYYY-MM-DD", kind: "person"}, {birth, kind: "pet", species}, {mode: "owner-pet", lang}) -> {mode, source, title, lines}
     birth dates only (never a photo); Thai birth-day pair, year animals and the BaZi element cycle, always framed warmly */
  function ownerPet(a, b, opts) {
    const lang = langOf(opts.lang), L = KB.PET[lang], N = KB.NAMES, out = { mode: "owner-pet", source: "lensiq-compat", title: L.title, lines: [] };
    const parse = x => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String((x && x.birth) || "")); if (!m) return null;
      const y = +m[1], mo = +m[2], d = +m[3]; if (!(y >= 1900 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= new Date(Date.UTC(y, mo, 0)).getUTCDate())) return null;
      return person({ y, m: mo, d, time: null, tz: 7 }); };
    const O = parse(a), P = parse(b);
    if (!O) return out;
    const day = n => N.day[lang][n];
    if (!P) { out.lines.push(fill(L.solo, { x: day(O.thai.day) })); out.lines.push(L.belief); return out; }
    const dp = thai.dayPair(O.thai.day, P.thai.day);
    const k = dp.same ? "same" : ["mitr", "thatu", "somphon", "satru"].find(x => dp.kinds.includes(x)) || "none";
    out.lines.push(fill(L[k], { x: day(O.thai.day), y: day(P.thai.day) }));
    const yr = bazi.branchRels(O.thai.animal, P.thai.animal), yk = ["six", "three", "clash"].find(x => yr.includes(x));
    if (yk) out.lines.push(fill(L[yk], { x: N.animal[lang][O.thai.animal], y: N.animal[lang][P.thai.animal] }));
    const sr = bazi.stemRel(O.bazi.dayStem, P.bazi.dayStem);
    if (sr.rel === "aGen") out.lines.push(fill(L.genOwner, { x: N.el5[lang][O.bazi.dmEl], y: N.el5[lang][P.bazi.dmEl] }));
    if (sr.rel === "bGen") out.lines.push(fill(L.genPet, { x: N.el5[lang][P.bazi.dmEl], y: N.el5[lang][O.bazi.dmEl] }));
    out.lines.push(L.belief);
    return out;
  }
  function pair(A, B, opts) {
    opts = opts || {};
    if (opts.mode === "owner-pet") return ownerPet(A, B, opts);
    const th = thaiSignals(A, B), bz = baziSignals(A, B), vd = vedicSignals(A, B), ws = westernSignals(A, B);
    const methods = {
      thai: { score: scoreOf(th.out), max: 100, guide: true, signals: th.out, facts: th.facts },
      bazi: { score: scoreOf(bz.out), max: 100, guide: true, signals: bz.out, facts: bz.facts },
      vedic: { score: (vd.facts.ab.total + vd.facts.ba.total) / 2, max: 30, signals: vd.out, facts: vd.facts },
      western: ws.off ? { score: null, max: 100, off: true, signals: [], facts: null } : { score: scoreOf(ws.out), max: 100, guide: true, signals: ws.out, facts: ws.facts },
    };
    const categories = {}, agreement = {};
    for (const cat of CATEGORIES) {
      const byMethod = {}, all = [];
      for (const m of METHODS) {
        if (methods[m].off) { byMethod[m] = null; continue; }
        const s = methods[m].signals.filter(g => g.cats.includes(cat));
        all.push(...s);
        byMethod[m] = leanOf(s);
      }
      const vals = Object.values(byMethod).filter(v => v != null);
      const level = vals.reduce((s, v) => s + LEAN_VAL[v], 0) / (vals.length || 1);
      categories[cat] = { lean: level >= 0.67 ? "fit" : level <= 0.33 ? "care" : "mixed", level, byMethod, signals: all };
      agreement[cat] = { leans: byMethod, agree: vals.length >= 2 && vals.every(v => v === vals[0]) };
    }
    return { kind: "pair", rel: opts.rel || "couple", a: A, b: B, methods, categories, agreement };
  }

  /* ================= group (3–8) ================= */
  function group(people, opts) {
    opts = opts || {};
    if (!Array.isArray(people) || people.length < 3) throw new Error("a group needs 3 to 8 people");
    if (people.length > 8) throw new Error("a group has at most 8 people");
    const pairs = [];
    for (let i = 0; i < people.length; i++) for (let j = i + 1; j < people.length; j++) pairs.push({ i, j, res: pair(people[i], people[j], opts) });
    const roles = people.map((p, i) => ({ i, el: p.bazi.dmEl, feeds: people.map((q, j) => (j !== i && GEN[p.bazi.dmEl] === q.bazi.dmEl ? j : -1)).filter(j => j >= 0) }));
    const categories = {};
    for (const cat of CATEGORIES) {
      const level = pairs.reduce((s, p) => s + p.res.categories[cat].level, 0) / pairs.length;
      categories[cat] = { lean: level >= 0.67 ? "fit" : level <= 0.33 ? "care" : "mixed", level };
    }
    return { kind: "group", rel: opts.rel || "team", people, n: people.length, pairs, roles, categories };
  }

  /* ================= report text ================= */
  const langOf = l => (l === "en" || l === "zh" ? l : "th");
  const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m));
  function nameVal(o, lang) {
    if (o == null || typeof o !== "object") return o;
    const N = KB.NAMES;
    if (o.day != null) return N.day[lang][o.day];
    if (o.animal != null) return N.animal[lang][o.animal];
    if (o.branch != null) return N.branch[o.branch] + (lang === "zh" ? "" : " (" + N.animal[lang][o.branch] + ")");
    if (o.stem != null) return N.stem[o.stem] + (lang === "zh" ? "" : " (" + N.el5[lang][STEM_EL[o.stem]] + ")");
    if (o.el5) return N.el5[lang][o.el5];
    if (o.el4) return N.el4[lang][o.el4];
    if (o.yel) return N.yel[lang][o.yel];
    if (o.koota) return N.koota[lang][o.koota];
    if (o.planet) return N.planet[lang][o.planet];
    if (o.aspect) return N.aspect[lang][o.aspect];
    return "";
  }
  /** one signal's text in the reading's language: { fit } or { care, step } */
  function sigText(g, lang, names) {
    const L = KB.S[g.id] && KB.S[g.id][lang];
    if (!L) return null;
    const v = { a: names[g.swap ? 1 : 0], b: names[g.swap ? 0 : 1] };
    for (const k of Object.keys(g.v || {})) v[k] = typeof g.v[k] === "object" ? nameVal(g.v[k], lang) : (typeof g.v[k] === "number" ? fmt(g.v[k], lang) : g.v[k]);
    if (g.id.startsWith("bazi.br.")) {
      const BR = KB.BR[lang];
      v.w = BR.w[g.where]; v.rel = KB.NAMES.brRel[lang][g.rel];
      if (g.pol === "fit") v.where_fit = BR.fit[g.where]; else { v.where_care = BR.care[g.rel][g.where]; v.where_step = (g.where === "year" ? BR.stepYear : BR.step)[g.rel]; }
    }
    const pre = KB.METHOD[g.m].short[lang] + (lang === "zh" ? "：" : ": ");
    if (g.pol === "fit") return L.f ? { fit: pre + fill(L.f, v) } : null;
    return L.c ? { care: pre + fill(L.c, v), step: fill(L.s, v) } : null;
  }
  const fmt = (x, lang) => (Math.round(x * 10) / 10).toString().replace(/\.0$/, "") + (lang ? "" : "");
  const joinList = (arr, lang) => arr.join(KB.T[lang].list);
  const catName = (c, lang) => KB.CAT[c][lang];

  /** each signal is said once, in its own (first) category; the other categories it touches only count it in their lean */
  const primary = (sigs, cat) => sigs.filter(g => g.cats[0] === cat);
  function careElse(cat, sigs, lang) {
    const others = [...new Set(sigs.filter(g => g.pol === "care" && g.cats[0] !== cat).map(g => g.cats[0]))];
    return others.length ? fill(KB.CARE_ELSE[lang], { c: catName(cat, lang), list: joinList(others.map(c => catName(c, lang)), lang) }) : KB.CARE_NONE[lang];
  }
  function sectionFor(cat, allSigs, lang, names, tier) {
    const fit = [], care = [], steps = [], seen = new Set(), sigs = primary(allSigs, cat);
    const sorted = sigs.slice().sort((x, y) => y.w - x.w);
    for (const g of sorted) {
      const t = sigText(g, lang, names);
      if (!t) continue;
      const key = g.id + ":" + g.pol + ":" + (g.where || "") + ":" + (g.rel || ""); // one text per kind of signal (the strongest)
      if (seen.has(key)) continue; seen.add(key);
      if (t.fit && fit.length < 3) fit.push(t.fit);
      if (t.care) { care.push(t.care); steps.push(t.step); }
    }
    if (!fit.length) fit.push(KB.GEN[cat][lang].f);
    const adjust = steps.concat(KB.GEN[cat][lang].a);
    const s = { id: cat, title: catName(cat, lang), color: KB.CAT[cat].color, icon: KB.CAT[cat].icon, fit, care, steps, adjust, paid: tier === "full" && !FREE_CATEGORIES.includes(cat) };
    if (!care.length) s.careNone = careElse(cat, allSigs, lang);
    return s;
  }
  function methodDetail(m, res, lang, names) {
    const T = KB.T[lang], N = KB.NAMES, M = res.methods[m], A = res.a, B = res.b, d = [];
    const name = KB.METHOD[m][lang];
    if (M.off) return { id: m, name, score: null, max: M.max, detail: [T.westOff] };
    if (m === "thai") {
      const f = M.facts, k = f.dp.same ? ["same"] : f.dp.kinds.length ? f.dp.kinds : ["none"];
      d.push(fill(T.thaiDay, { x: N.day[lang][A.thai.day], y: N.day[lang][B.thai.day], k: k.map(x => N.thaiKind[lang][x]).join(T.list) }));
      const yr = f.yr.filter(x => ["six", "three", "same", "clash", "punish", "harm"].includes(x));
      d.push(fill(T.thaiYear, { x: N.animal[lang][A.thai.animal], y: N.animal[lang][B.thai.animal], k: (yr.length ? yr : ["none"]).map(x => N.brRel[lang][x]).join(T.list) }));
      d.push(fill(T.thaiYel, { x: N.yel[lang][A.thai.yearEl], y: N.yel[lang][B.thai.yearEl], k: N.yelRel[lang][f.ye] }));
      d.push(T.guide);
    } else if (m === "bazi") {
      const f = M.facts;
      d.push(fill(T.baziDm, { x: N.stem[A.bazi.dayStem], ex: N.el5[lang][A.bazi.dmEl], y: N.stem[B.bazi.dayStem], ey: N.el5[lang][B.bazi.dmEl],
        k: fill(N.dmRel[lang][f.sr.rel], { a: names[0], b: names[1] }) + (f.sr.combo ? T.list + "五合" : "") + (f.sr.clash ? T.list + "天干相冲" : "") }));
      const rl = rels => (rels.length ? rels : ["none"]).map(x => N.brRel[lang][x]).join(T.list);
      d.push(fill(T.baziDay, { x: nameVal({ branch: A.bazi.dayBranch }, lang), y: nameVal({ branch: B.bazi.dayBranch }, lang), k: rl(f.day) }));
      d.push(fill(T.baziYear, { x: nameVal({ branch: A.bazi.yearBranch }, lang), y: nameVal({ branch: B.bazi.yearBranch }, lang), k: rl(f.year) }));
      d.push(T.guide);
    } else if (m === "vedic") {
      const f = M.facts, nk = i => (N.nak[lang] || N.nak.en)[i];
      d.push(fill(T.vedNak, { a: names[0], b: names[1], x: nk(A.vedic.nak), rx: N.rashi[lang][A.vedic.rashi], y: nk(B.vedic.nak), ry: N.rashi[lang][B.vedic.rashi] }));
      d.push(fill(T.vedKoota, { list: Object.keys(vedic.MAX).map(k => N.koota[lang][k] + " " + fmt((f.ab.kootas[k] + f.ba.kootas[k]) / 2) + "/" + vedic.MAX[k]).join(T.list) }));
      if (f.ab.total !== f.ba.total) d.push(fill(T.vedOrder, { a: names[0], b: names[1], s1: fmt(f.ab.total), s2: fmt(f.ba.total) }));
      if (f.ab.cancel.bhakoot || f.ba.cancel.bhakoot) d.push(fill(T.vedCancel, { k: N.koota[lang].bhakoot }));
      if (f.ab.cancel.nadi || f.ba.cancel.nadi) d.push(fill(T.vedNadiEx, { k: N.koota[lang].nadi }));
      [[A, names[0]], [B, names[1]]].forEach(([P, nm]) => { if (P.vedic.uncertain) d.push(fill(T.vedUnsure, { a: nm, x: nk(P.vedic.alt[0]), y: nk(P.vedic.alt[1]) })); });
      d.push(T.vedNoGana, T.vedYoniNote);
      if (res.rel !== "couple") d.push(T.vedNotCouple);
    } else {
      const f = M.facts;
      d.push(T.westPlanets);
      const top = f.asp.slice(0, 3).map(x => (lang === "zh" ? names[0] + "的" + N.planet[lang][x.p] + "与" + names[1] + "的" + N.planet[lang][x.q] + N.aspect[lang][x.type]
        : lang === "en" ? names[0] + "'s " + N.planet[lang][x.p] + " " + N.aspect[lang][x.type] + " " + names[1] + "'s " + N.planet[lang][x.q]
          : N.planet[lang][x.p] + "ของ" + names[0] + " " + N.aspect[lang][x.type] + " " + N.planet[lang][x.q] + "ของ" + names[1]) + " (" + fmt(x.orb) + "°)");
      d.push(top.length ? fill(T.westTop, { list: top.join(T.list) }) : T.westNone);
      if (f.noTime) d.push(T.westNoTime);
      d.push(T.guide);
    }
    return { id: m, name, score: M.score, max: M.max, guide: !!M.guide, detail: d };
  }
  function agreementRows(res, lang) {
    const T = KB.T[lang];
    return CATEGORIES.map(cat => {
      const a = res.agreement[cat], vals = METHODS.filter(m => a.leans[m] != null);
      let text;
      if (vals.length < 2) text = T.agreeFew;
      else if (a.agree) text = fill(T.agreeYes, { lean: KB.LEAN[a.leans[vals[0]]][lang] });
      else text = fill(T.agreeNo, { parts: vals.map(m => fill(T.agreePart, { m: KB.METHOD[m].short[lang], lean: KB.LEAN[a.leans[m]][lang] })).join(T.list) });
      return { cat, title: catName(cat, lang), color: KB.CAT[cat].color, icon: KB.CAT[cat].icon, leans: Object.assign({}, a.leans), agree: a.agree, text };
    });
  }
  function pairReport(res, opts) {
    const lang = langOf(opts.lang), T = KB.T[lang], tier = opts.tier === "full" ? "full" : "free";
    const names = [opts.names && opts.names[0] ? opts.names[0] : T.defNames[0], opts.names && opts.names[1] ? opts.names[1] : T.defNames[1]];
    const all = CATEGORIES.map(c => sectionFor(c, res.categories[c].signals, lang, names, tier));
    const fitCats = CATEGORIES.filter(c => res.categories[c].lean === "fit"), careCats = CATEGORIES.filter(c => res.categories[c].lean === "care");
    const lv = CATEGORIES.reduce((s, c) => s + res.categories[c].level, 0) / CATEGORIES.length;
    const overall = lv >= 0.62 ? "fit" : lv <= 0.38 ? "care" : "mixed";
    const computed = METHODS.filter(m => !res.methods[m].off).length, agreeN = CATEGORIES.filter(c => res.agreement[c].agree).length;
    const lines = [
      fitCats.length ? fill(T.ovLead, { lean: T.leanWord[overall], fit: joinList(fitCats.map(c => catName(c, lang)), lang) }) : fill(T.ovLeadNoFit, { lean: T.leanWord[overall] }),
      careCats.length ? fill(T.ovCare, { care: joinList(careCats.map(c => catName(c, lang)), lang) }) : T.ovCareNone,
      fill(T.ovAgree, { n: computed, k: agreeN, d: CATEGORIES.length - agreeN }),
      T.ovFrame,
    ];
    // rule a: every caution of every category, with its step, is in the free overview
    const cautions = [], seen = new Set();
    for (const s of all) s.care.forEach((c, i) => { if (seen.has(c)) return; seen.add(c); cautions.push({ cat: s.id, title: s.title, text: c, step: s.steps[i] }); });
    const wheel = CATEGORIES.map(c => ({ cat: c, title: catName(c, lang), lean: res.categories[c].lean, leanText: KB.LEAN[res.categories[c].lean][lang], level: res.categories[c].level, color: KB.CAT[c].color, icon: KB.CAT[c].icon }));
    return {
      lang, mode: "pair", tier, names, workUse: res.rel === "business" ? KB.WORK_USE[lang] : undefined,
      overview: { title: fill(T.ovTitle, { a: names[0], b: names[1] }), lean: overall, lines, cautions, wheel, methods: METHODS.map(m => methodDetail(m, res, lang, names)) },
      agreement: agreementRows(res, lang),
      sections: tier === "full" ? all : all.filter(s => FREE_CATEGORIES.includes(s.id)),
      disclaimer: KB.T && root.LQNotice ? root.LQNotice.LINE[lang] : null,
    };
  }
  function groupReport(res, opts) {
    const lang = langOf(opts.lang), T = KB.T[lang], tier = opts.tier === "full" ? "full" : "free";
    const names = res.people.map((p, i) => (opts.names && opts.names[i]) || T.defNames[i]);
    const map = res.pairs.map(p => {
      const nm = [names[p.i], names[p.j]], r = p.res, lean = CATEGORIES.reduce((s, c) => s + r.categories[c].level, 0) / CATEGORIES.length;
      const L = lean >= 0.62 ? "fit" : lean <= 0.38 ? "care" : "mixed";
      const best = CATEGORIES.slice().sort((x, y) => r.categories[y].level - r.categories[x].level)[0];
      const worst = CATEGORIES.slice().sort((x, y) => r.categories[x].level - r.categories[y].level)[0];
      const cell = { i: p.i, j: p.j, lean: L, level: lean, leanText: KB.LEAN[L][lang] };
      if (L === "care" || r.categories[worst].lean === "care") {
        const sec = sectionFor(worst, r.categories[worst].signals, lang, nm, tier);
        cell.text = fill(T.mapCellCare, { a: nm[0], b: nm[1], lean: KB.LEAN[L][lang], care: catName(worst, lang) });
        cell.step = fill(T.mapStep, { s: sec.adjust[0] });
      } else cell.text = fill(T.mapCell, { a: nm[0], b: nm[1], lean: KB.LEAN[L][lang], fit: catName(best, lang) });
      return cell;
    });
    const byLevel = map.slice().sort((x, y) => y.level - x.level), bestP = byLevel[0], careP = byLevel[byLevel.length - 1];
    const pn = c => fill(T.pairTitle, { a: names[c.i], b: names[c.j] });
    const lines = [careP.lean === "care" || careP.level < 0.45 ? fill(T.grpLead, { best: pn(bestP), care: pn(careP) }) : fill(T.grpLeadAll, { best: pn(bestP) }), T.grpRoles, T.grpFrame];
    const roles = res.roles.map(r => ({ i: r.i, name: names[r.i], el: r.el, elName: KB.NAMES.el5[lang][r.el], role: KB.ROLE[r.el][lang].r,
      strength: KB.ROLE[r.el][lang].s + (r.feeds.length ? " " + fill(T.feeds, { list: joinList(r.feeds.map(j => names[j]), lang) }) : "") }));
    // group categories: the strongest signals across pairs, each naming its pair
    const sections = CATEGORIES.map(cat => {
      const sigs = [];
      for (const p of res.pairs) for (const g of primary(p.res.categories[cat].signals, cat)) sigs.push(Object.assign({}, g, { _pair: [p.i, p.j] }));
      const fit = [], care = [], steps = [], seen = new Set();
      for (const g of sigs.sort((x, y) => y.w - x.w)) {
        const t = sigText(g, lang, [names[g._pair[0]], names[g._pair[1]]]);
        if (!t) continue;
        const key = g.id + ":" + g.pol + ":" + (g.where || "") + ":" + (g.rel || ""); if (seen.has(key)) continue; seen.add(key);
        if (t.fit && fit.length < 3) fit.push(t.fit);
        if (t.care && care.length < 4) { care.push(t.care); steps.push(t.step); }
      }
      if (!fit.length) fit.push(KB.GEN[cat][lang].f);
      const s = { id: cat, title: catName(cat, lang), color: KB.CAT[cat].color, icon: KB.CAT[cat].icon, fit, care, steps, adjust: steps.concat(KB.GEN[cat][lang].a), paid: tier === "full" && !FREE_CATEGORIES.includes(cat) };
      if (!care.length) s.careNone = careElse(cat, res.pairs.flatMap(p => p.res.categories[cat].signals), lang);
      return s;
    });
    const cautions = [];
    for (const s of sections) s.care.forEach((c, i) => cautions.push({ cat: s.id, title: s.title, text: c, step: s.steps[i] }));
    const wheel = CATEGORIES.map(c => ({ cat: c, title: catName(c, lang), lean: res.categories[c].lean, leanText: KB.LEAN[res.categories[c].lean][lang], level: res.categories[c].level, color: KB.CAT[c].color, icon: KB.CAT[c].icon }));
    const out = {
      lang, mode: "group", tier, names,
      overview: { title: fill(T.ovGroupTitle, { n: res.n }), lines, cautions, wheel, methods: [] },
      map, roles, workUse: KB.WORK_USE[lang],
      sections: tier === "full" ? sections : sections.filter(s => FREE_CATEGORIES.includes(s.id)),
      agreement: [],
    };
    if (tier === "full") out.pairs = res.pairs.map(p => pairReport(p.res, { lang, tier: "full", names: [names[p.i], names[p.j]] })).map(r => ({ title: r.overview.title, lines: r.overview.lines.slice(0, 2), cautions: r.overview.cautions }));
    return out;
  }
  function report(res, opts) {
    opts = opts || {};
    return res && res.kind === "group" ? groupReport(res, opts) : pairReport(res, opts);
  }

  /** free or full: full only when LENSIQ_FORTUNE_PAID is exactly true and the crisis net allows paid content (fails closed) */
  function tierFor(win, crisisApi, doc) {
    if (!win || win.LENSIQ_FORTUNE_PAID !== true) return "free";
    if (!crisisApi || typeof crisisApi.allow !== "function") return "free";
    try { return crisisApi.allow("paid", doc) ? "full" : "free"; } catch (e) { return "free"; }
  }

  const api = { CATEGORIES, FREE_CATEGORIES, METHODS, thai, bazi, vedic, western, person, pair, group, report, tierFor, leanOf, KB };
  if (isNode) module.exports = api; else root.LQCompat = api;
})(typeof window !== "undefined" ? window : globalThis);

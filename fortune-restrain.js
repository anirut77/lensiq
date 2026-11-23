/* fortune-restrain.js — which fortune fact items RESTRAIN or WARN, as data (owner rule: caution / unfavourable text is never
   folded behind "อ่านเพิ่มเติม"; independent review 2026-11-15: word lists only catch the words they test, so every entry was
   tagged by reading it in TH / EN / ZH, per discipline; the per-discipline summary is in docs/FORTUNE-LAYOUT.md).
   TAGS[domain]["<areas>" | "all"] = space-separated item keys. "all" = the item's label and every meaning area (a sign the
   tradition names unfavourable, or every area restrains); otherwise the listed meaning areas (any language's text in that area
   holds back, delays, limits or warns). Keys are fact item ids; tarot ids drop their spread position ("card.past.swords04.r" ->
   "swords04.r"); a "*" matches one id part. Chart-dependent tags come from the engine as item.restrain (fengshui.js).
   A numbers sum ("sum.NN") reuses the text of its pair ("pair.NN"), so an untagged sum takes its pair's tag (plus overview,
   which carries the same text). Tips: facts.extras.restrainTips lists the tips the engine's data marks as restraining
   (numbers-kb.js goals[].tips[].avoid). fortune-ai.js marks every paragraph that carries a tagged entry's text as caution
   (sources), records each template filled with an unfavourable or tagged item at the fill site (fill), and records
   provenance(): area = a meaning area, "label", "tip" or "fill". */
(function (root) {
  "use strict";
  const TAGS = /** @type {Record<string, Record<string, string>>} */ ({
    "face": {
      "advice": "age.25 brow.sword eye.soft mountain.lead.east mouth.full palace.jie.high palace.xiongdi.high philtrum.long yintang.narrow zone.middle",
      "advice,money,personality": "element.fire",
      "advice,timing": "element.water",
      "timing": "element.wood"
    },
    "palm": {
      "advice": "element.water heart.curved life.close thumb.short",
      "money": "element.air element.fire head.sloping"
    },
    "horoscope": {
      "advice": "cn.year.0.fire cn.year.1.fire cn.year.3.fire cn.year.5.fire cn.year.6.fire cn.year.7.fire cn.year.8.fire cn.year.9.fire cn.year.10.fire" +
        " " + "num.lp.6 thai.day.1 thai.lagna.0 thai.lagna.3",
      "advice,money": "cn.year.2.earth cn.year.2.fire cn.year.2.metal cn.year.2.water cn.year.2.wood cn.year.4.fire cn.year.11.earth cn.year.11.fire" +
        " " + "cn.year.11.metal cn.year.11.water cn.year.11.wood thai.day.2 thai.rasi.0 thai.rasi.11",
      "money": "bazi.dm.2 bazi.god.BJ bazi.god.QS bazi.god.SG cn.year.4.earth cn.year.4.metal cn.year.4.water cn.year.4.wood num.lp.3 num.lp.5 num.lp.9" +
        " " + "thai.day.0 thai.day.5 thai.day.7 thai.rasi.8",
      "money,social": "bazi.god.JC",
      "work": "bazi.excess.fire bazi.excess.water bazi.excess.wood"
    },
    "tarot": {
      "advice,money,overview,work": "m10.r",
      "advice,money,work": "m10",
      "advice,overview": "spread.pattern",
      "all": "cups05 m15 m16 pentacles05 swords03 swords04 swords05 swords08 swords09 swords10 wands10",
      "love,money,overview,work": "cups02.r cups03.r cups04.r cups07.r cups08.r cups09.r cups12.r cups13.r cups14.r m00.r m02.r m03.r m04.r m07.r m08.r m09.r m12.r m13.r m14.r" +
        " " + "m16.r m17.r m18 m18.r m19.r pentacles01.r pentacles04.r pentacles05.r pentacles06.r pentacles09.r pentacles10.r pentacles11.r pentacles14.r" +
        " " + "swords03.r swords04.r swords05.r swords08.r swords09.r swords10.r swords11.r swords12.r swords13.r swords14.r wands01.r wands02.r wands03.r" +
        " " + "wands06.r wands07.r wands08.r wands11.r wands12.r wands13.r",
      "love,money,work": "cups01.r cups06.r cups11.r m01.r m06.r m11.r m21.r pentacles03.r pentacles08.r pentacles13.r swords02.r swords07.r wands05.r wands10.r",
      "love,overview,work": "swords02 wands05",
      "money": "cups03 swords07 wands02",
      "money,overview,work": "cups05.r cups10.r m05.r m12 m15.r m20.r pentacles02.r pentacles07.r pentacles12.r swords01.r swords06.r wands04.r wands09.r wands14.r",
      "money,work": "cups07 cups12 m00 m02 m05",
      "overview": "m09 m13 pair.cups04+cups05 pair.cups05+cups06 pair.m00+m13 pair.m06+m15 pair.m09+pentacles07 pair.m12+m13 pair.m12+swords02 pair.m13+m20" +
        " " + "pair.m14+swords04 pair.m15+m16 pair.m16+m17 pair.m16+m20 pair.m17+m18 pair.m17+swords03 pair.m18+m19 pair.m18+swords09 pair.m20+swords10" +
        " " + "pair.pentacles04+pentacles05 pair.pentacles05+pentacles06 pair.swords02+swords03 pair.swords03+swords04 pair.swords04+swords05" +
        " " + "pair.swords05+swords06 pair.swords07+swords08 pair.swords08+swords09 pair.swords09+swords10 pair.wands04+wands05 pair.wands09+wands10",
      "overview,work": "pentacles07",
      "work": "cups02 cups10 m07 m17 m20 pentacles02 pentacles04 pentacles09 pentacles12 pentacles14 swords01 swords06 swords11 swords13 wands01 wands04" +
        " " + "wands06 wands09 wands11 wands14"
    },
    "siamsee": {
      "advice,work": "siamsee.2",
      "all": "siamsee.4 siamsee.7 siamsee.11 siamsee.15 siamsee.18 siamsee.22 siamsee.25"
    },
    "fengshui": {
      "advice": "rec.bed.*",
      "all": "dir.quiet"
    },
    "numbers": {
      "advice,love": "pair.12 pair.21",
      "advice,money": "pair.18 pair.81",
      "advice": "pair.00 pair.11",
      "advice,personality": "pair.13 pair.25 pair.31 pair.33 pair.52",
      "all": "pair.03 pair.07 pair.08 pair.27 pair.28 pair.30 pair.37 pair.47 pair.58 pair.67 pair.70 pair.72 pair.73 pair.74 pair.76 pair.77 pair.80" +
        " " + "pair.82 pair.85 pair.88 sum.13 sum.18 sum.21 sum.25 sum.27 sum.28 sum.30 sum.31 sum.33 sum.37 sum.47 sum.52 sum.58 sum.67",
      "money,overview": "pair.38 pair.48 pair.78 pair.83 pair.84 pair.87 sum.38 sum.48",
      "overview,work": "pair.17 pair.71 sum.17 sum.71"
    },
    "iching": {
      "advice,love,money,overview,timing,work": "rel.26",
      "advice,love,money,overview,work": "hex.26",
      "advice,money": "hex.49 rel.49",
      "all": "hex.3 hex.5 hex.6 hex.10 hex.12 hex.23 hex.29 hex.33 hex.36 hex.39 hex.41 hex.44 hex.47 hex.52 hex.60 line.1 line.3 line.6 rel.3 rel.5 rel.6" +
        " " + "rel.10 rel.12 rel.23 rel.29 rel.33 rel.36 rel.39 rel.41 rel.44 rel.47 rel.52 rel.60",
      "love,money,overview,timing,work": "rel.25 rel.64",
      "love,money,overview,work": "hex.25 hex.64",
      "money": "hex.4 hex.18 hex.27 hex.32 hex.34 hex.51 hex.59 rel.4 rel.18 rel.27 rel.32 rel.34 rel.51 rel.59",
      "money,overview": "hex.28 hex.38",
      "money,overview,timing": "hex.20 hex.62 rel.20 rel.28 rel.38 rel.62",
      "money,timing": "hex.55 rel.55",
      "money,work": "hex.54 rel.54",
      "overview,social": "tri.lower.kan tri.upper.kan",
      "overview,timing": "hex.63 rel.63",
      "overview,timing,work": "rel.21",
      "overview,work": "hex.21",
      "personality,social": "tri.lower.gen tri.upper.gen"
    },
    "zodiac": {
      "advice": "animal.11",
      "all": "rel.break rel.clash rel.harm rel.same",
      "money": "animal.0 el.same",
      "money,overview": "el.power"
    },
    "astro": {
      "advice,money": "sun.11",
      "advice": "el.fire moon.2 moon.11 sun.2",
      "money": "sun.0 sun.4"
    },
    "dream": {
      "love,money,overview,work": "sym.turtle",
      "love": "sym.fish sym.stairs",
      "love,work": "sym.run",
      "money,overview": "sym.ex",
      "money": "sym.car sym.crocodile sym.dog sym.door sym.elder sym.elephant sym.flower sym.fly sym.friend sym.fruit sym.gold sym.hands sym.market" +
        " " + "sym.phone sym.ring sym.swim sym.teeth sym.tiger sym.tree sym.umbrella sym.win",
      "money,work": "sym.ancestor sym.book sym.buddha sym.candle sym.egg sym.flood sym.hair sym.merit sym.monk sym.naga sym.school sym.teacher sym.temple",
      "overview": "mood.confused sym.argue sym.cat sym.cave sym.chased sym.clock sym.fall sym.lost sym.mirror sym.monkey sym.thunder theme.inner",
      "overview,timing": "type",
      "work": "sym.bird sym.horse sym.mountain sym.river"
    },
    "bazi": {
      "advice,money": "luck.peer",
      "advice,work": "luck.officer",
      "all": "el.lo.earth el.lo.fire el.lo.metal el.lo.water el.lo.wood str.weak",
      "timing": "luck.wealth"
    },
    "taksa": {
      "all": "tk.kalakini.1 tk.kalakini.2 tk.kalakini.3 tk.kalakini.4 tk.kalakini.5 tk.kalakini.6 tk.kalakini.7 tk.kalakini.8"
    },
    "lek7": {
      "all": "l7.0.caution l7.1.caution l7.2.caution l7.3.caution l7.4.caution l7.5.caution l7.6.caution"
    },
    "lifegraph": {
      "all": "lg.now.care.caution lg.now.love.caution lg.now.money.caution",
      "timing": "lg.luck.wealth"
    }
  });
  const GLOB = /** @type {Record<string, Array<[RegExp, string[] | "all"]>>} */ ({}), EXACT = /** @type {Record<string, Record<string, string[] | "all">>} */ ({});
  for (const d of Object.keys(TAGS)) {
    GLOB[d] = []; EXACT[d] = {};
    for (const a of Object.keys(TAGS[d])) for (const k of TAGS[d][a].split(" ")) {
      const v = a === "all" ? "all" : a.split(",");
      if (k.indexOf("*") >= 0) GLOB[d].push([new RegExp("^" + k.replace(/[.]/g, "\\.").replace(/\*/g, "[^.]+") + "$"), v]); else EXACT[d][k] = v;
    }
  }
  const key = (/** @type {string} */ d, /** @type {string} */ id) => (d === "tarot" ? String(id).replace(/^card\.[a-z]+\./, "") : String(id));
  /** tag of one fact item: "all" | string[] (areas) | null; the engine's own item.restrain first, then the table */
  function of(/** @type {string} */ d, /** @type {any} */ it) {
    if (!it) return null;
    if (it.restrain === "all" || (Array.isArray(it.restrain) && it.restrain.length)) return it.restrain;
    const k = key(d, it.id || ""), E = EXACT[d];
    if (E && E[k]) return E[k];
    for (const [re, v] of GLOB[d] || []) if (re.test(k)) return v;
    const sum = d === "numbers" && /^sum\.(\d\d)$/.exec(k), p = sum && E && E["pair." + sum[1]];
    return p ? (p === "all" ? "all" : [...new Set(p.concat("overview"))]) : null;
  }
  const count = (/** @type {string} */ d) => (TAGS[d] ? Object.values(TAGS[d]).reduce((n, ks) => n + ks.split(" ").length, 0) : 0);
  /** the text of every tagged entry in a fact set, in the reading language: [{ id, area, text }]; tr(item) -> that language's item */
  function sources(/** @type {any} */ F, /** @type {(it: any) => any} */ tr) {
    const out = /** @type {Array<{id: string, area: string, text: string}>} */ ([]);
    for (const it of (F && F.items) || []) {
      const tag = of(F.domain, it); if (!tag) continue;
      const x = tr(it) || {}, ms = x.meanings || {};
      if (tag === "all") for (const t of [x.label, x.short]) if (t) out.push({ id: it.id, area: "label", text: String(t) });
      for (const a of tag === "all" ? Object.keys(ms) : tag) for (const t of [].concat(ms[a] || [])) if (t) out.push({ id: it.id, area: a, text: String(t) });
    }
    const tips = F && F.extras && Array.isArray(F.extras.restrainTips) ? F.extras.restrainTips : [];
    for (const t of tips) if (t) out.push({ id: "extras.tips", area: "tip", text: String(t) });
    return out;
  }
  /** fill site: a template filled with these items (or "named": every item whose name is in the text) is caution text when
   *  one of them is unfavourable (isCaution) or tagged ("all" only when allOnly); records { id, area: "fill", text } into rec.
   *  With m (a meaning the composer rewrote into text, Thai): records { id, area: the tagged area that meaning came from, text }
   *  when m is one of a tagged area's meanings of these items ("any": every item, and the restraining tips); clean = the
   *  composer's cleanMeaning. The rewritten text itself is never matched. */
  function fill(/** @type {any[]} */ rec, /** @type {any} */ F, /** @type {any} */ its, /** @type {string} */ text,
    /** @type {(it: any) => boolean} */ isCaution, /** @type {boolean} */ allOnly, /** @type {string} */ m, /** @type {(s: string) => string} */ clean) {
    if (!rec || !F || !text) return;
    if (m) return fromMeaning(rec, F, its, text, isCaution, String(m), clean || ((/** @type {string} */ s) => String(s || "").trim()));
    const names = (/** @type {any} */ it) => [it.short, it.label, String(it.label || "").replace(/\s*[(（][^)）]*[)）]/g, "").trim()];
    const named = (/** @type {any} */ it) => names(it).some(n => n && String(n).length >= 2 && text.indexOf(String(n)) >= 0);
    const byId = (/** @type {any} */ it) => (F.items || []).find((/** @type {any} */ x) => it && String(x.id) === String(it.id)) || it; // the engine's own item
    const list = its === "named" ? (F.items || []).filter(named) : [].concat(its || []).map(byId);
    for (const it of list) {
      const tag = it && of(F.domain, it);
      if (it && (isCaution(it) || (tag && (!allOnly || tag === "all")))) { rec.push({ id: String(it.id), area: "fill", text: String(text) }); return; }
    }
  }
  function fromMeaning(/** @type {any[]} */ rec, /** @type {any} */ F, /** @type {any} */ its, /** @type {string} */ text,
    /** @type {(it: any) => boolean} */ isCaution, /** @type {string} */ m, /** @type {(s: string) => string} */ clean) {
    const same = (/** @type {any} */ x) => { const c = clean(String(x || "")); return !!c && (c === m || (m.length >= 8 && (c.indexOf(m) >= 0 || m.indexOf(c) >= 0))); };
    const byId = (/** @type {any} */ it) => (F.items || []).find((/** @type {any} */ x) => it && String(x.id) === String(it.id)) || it;
    for (const it of its === "any" ? F.items || [] : [].concat(its || []).map(byId)) {
      if (!it) continue;
      const tag = of(F.domain, it), ms = it.meanings || {}, caution = isCaution(it);
      if (!tag && !caution) continue;
      for (const a of tag === "all" || caution || !tag ? Object.keys(ms) : tag) {
        if ([].concat(ms[a] || []).some(same)) { rec.push({ id: String(it.id), area: a, text: String(text) }); return; }
      }
    }
    const tips = F.extras && Array.isArray(F.extras.restrainTips) ? F.extras.restrainTips : [];
    if (its === "any" && tips.some(same)) rec.push({ id: "extras.tips", area: "tip", text: String(text) });
  }
  // the fragments fortune-ai.js markCaution matches: clauses / words of 12+ characters (6+ for Chinese), and the whole text
  function frags(/** @type {string} */ t, /** @type {string} */ lang) {
    const en = lang === "en", s = en ? t.toLowerCase() : t;
    return (lang === "zh" ? s.split(/[，。；！？]/) : en ? s.split(/[,.;:!?]\s+/) : s.split(" ")).concat([s]).map(x => x.trim()).filter(x => x.length >= (lang === "zh" ? 6 : 12));
  }
  /** provenance: every final paragraph that carries text from a tagged entry -> [{ section, para, id, area }] */
  function provenance(/** @type {any} */ out, /** @type {string} */ lang, /** @type {Array<{id: string, area: string, text: string}>} */ src) {
    const lc = (/** @type {string} */ t) => (lang === "en" ? t.toLowerCase() : t), fr = src.map(x => ({ x, f: frags(x.text, lang) })), res = /** @type {any[]} */ ([]);
    for (const s of (out && out.sections) || []) (s.paragraphs || []).forEach((/** @type {string} */ p, /** @type {number} */ i) => {
      const seen = new Set(), P = lc(String(p));
      for (const { x, f } of fr) if (!seen.has(x.id + "|" + x.area) && f.some(q => P.includes(q))) { seen.add(x.id + "|" + x.area); res.push({ section: s.id, para: i, id: x.id, area: x.area }); }
    });
    return res;
  }
  /* whole summary lines (owner inbox entry 18 + review 2026-11-23, acceptance Q2 v3): a summary line is whole only when every copy
     of its last words in the reading's sources ends a sentence there, so it is never a fragment of a longer sentence the reading
     also shows. "." ends a sentence only before a space or the end and not after an abbreviation or a single letter (not "e.g",
     "9 a", "3" of "3.5"); ";" only when nothing follows. pools = [the engine facts' strings, the composed text]; the first pool
     that holds the last words decides (same definition as tools/fortune-cut-check.mjs). */
  const ABBR = /(?:^|[^\p{L}\p{N}])(?:e\.g|i\.e|etc|a\.m|p\.m|no|vs|mr|mrs|dr|\p{L})$/iu;
  function sentenceEnd(/** @type {string} */ before, /** @type {string} */ rest) {
    if (!rest.trim() || /[。！？]$/u.test(before) || (/[!?]$/u.test(before) && /^\s/u.test(rest))) return true;
    const m = /^\s*([.!?。！？;；])/u.exec(rest);
    if (!m) return false;
    const after = rest.slice(m[0].length);
    if (!after.trim()) return true;
    if (m[1] === ";" || m[1] === "；") return false;
    return !(m[1] === "." && (!/^\s/u.test(after) || ABBR.test(before)));
  }
  /** every string (length >= 8) inside facts, as tools/fortune-cut-check.mjs reads them */
  function strings(/** @type {any} */ x, /** @type {string[]} */ out = [], depth = 0) {
    if (depth > 7 || x == null) return out;
    if (typeof x === "string") { if (x.length >= 8) out.push(x); } else if (Array.isArray(x)) { for (const y of x) strings(y, out, depth + 1); }
    else if (typeof x === "object") for (const k of Object.keys(x)) strings(x[k], out, depth + 1);
    return out;
  }
  /** true when the reading continues the line t somewhere (t would be a cut fragment) */
  function continued(/** @type {string} */ t, /** @type {string[][]} */ pools) {
    const body = String(t || "").replace(/[.。\s]+$/u, "");
    for (const pool of pools) for (let L = Math.min(body.length, 40); L >= 12; L--) {
      const tail = body.slice(-L); let found = false;
      for (const s of pool) for (let i = s.indexOf(tail); i >= 0; i = s.indexOf(tail, i + 1)) { found = true; if (!sentenceEnd(s.slice(0, i + L), s.slice(i + L))) return true; }
      if (found) return false;
    }
    return false;
  }
  const API = { TAGS, of, count, sources, fill, provenance, strings, continued, sentenceEnd };
  // exports only from its own file: the copy inside fortune-read.js (tools/fortune-read-embed.mjs) leaves that module's exports alone
  if (typeof module !== "undefined" && module.exports && !Object.keys(module.exports).length) module.exports = API;
  root.LQFortuneRestrain = API;
})(typeof window !== "undefined" ? window : globalThis);

/* fortune-negstate.js — which TOPIC meaning areas describe a negative state, a worry or a difficulty together with what to do
   about it (round-3 independent review of fortune-paid, 2026-11-15). Rule (a): warnings and what to do about them stay free, so
   a tagged area is never paid depth (fortune-paid.js). Tagged by READING every topic meaning (TH / EN / ZH) of every fact item
   each discipline produces, not by word lists; items already marked caution / unfavourable, or tagged in fortune-restrain.js,
   were left out (they are caution already). Advice areas are guidance and free anyway. Per-discipline table and how it was
   read: docs/FORTUNE-PAID-DESIGN.md §11.
   TAGS[domain]["<areas>"] = space-separated item keys (tarot ids drop their spread position, as in fortune-restrain.js).
   Loaded with fortune-paid.js (only when LENSIQ_FORTUNE_PAID is true); fortune-straight.js markGuidance adds the tagged text
   to section.guidance, so the reading layout, and every page with the switch off, are unchanged. */
(function (root) {
  "use strict";
  const REVIEWED = { face: "2026-11-15", palm: "2026-11-15", horoscope: "2026-11-15", tarot: "2026-11-15", siamsee: "2026-11-15", fengshui: "2026-11-15",
    numbers: "2026-11-15", iching: "2026-11-15", zodiac: "2026-11-15", astro: "2026-11-15", dream: "2026-11-15", bazi: "2026-11-15", taksa: "2026-11-15",
    lek7: "2026-11-15", lifegraph: "2026-11-15" };
  const TAGS = /** @type {Record<string, Record<string, string>>} */ ({
    "astro": {
      "love": "moon.1",
      "love,personality": "moon.11 moon.2 moon.7 moon.9",
      "money": "sun.8",
      "personality": "moon.0 moon.3",
      "social": "sun.7"
    },
    "bazi": {},
    "dream": {
      "love": "sym.flood sym.laugh",
      "love,money": "sym.crab sym.fire sym.letter sym.mountain",
      "love,money,overview": "sym.river",
      "love,money,overview,work": "sym.bathroom sym.child sym.cry sym.exam sym.frog sym.rain sym.snow",
      "love,money,work": "sym.chased sym.lost",
      "love,overview": "sym.hair sym.temple",
      "love,overview,work": "sym.crocodile sym.dog sym.elder sym.elephant sym.friend sym.hands sym.phone sym.teeth sym.tiger sym.umbrella",
      "love,work": "sym.argue sym.cat sym.cave sym.clock sym.ex sym.fall sym.mirror sym.monkey",
      "money": "sym.fish sym.money sym.mouse sym.pig",
      "money,overview,work": "sym.pregnant sym.spider",
      "money,work": "sym.baby sym.key sym.office",
      "overview": "mood.anxious mood.sad sym.ancestor sym.bird sym.book sym.buddha sym.candle sym.flower sym.lover sym.merit sym.monk sym.naga sym.ring sym.school" +
        " " + "sym.sea sym.star sym.swim sym.teacher theme.change theme.freedom theme.growth theme.love theme.renewal theme.support theme.wisdom",
      "overview,work": "sym.bridge sym.butterfly sym.clothes sym.dance sym.door sym.fly sym.hotel sym.moon sym.move sym.rainbow sym.snake sym.stranger sym.tree sym.wedding" +
        " " + "sym.wind",
      "work": "sym.bee sym.boat sym.celebrity sym.chicken sym.cow sym.food sym.gem sym.house sym.parents sym.sun sym.thunder sym.win"
    },
    "face": {
      "love,social": "mouth.note.level",
      "love,work": "element.fire eye.soft",
      "personality": "element.wood yintang.narrow",
      "timing": "age.41"
    },
    "fengshui": {
      "overview": "dir.tianyi"
    },
    "horoscope": {
      "love": "thai.day.1",
      "overview": "bazi.strength.weak",
      "personality": "bazi.dm.7 bazi.excess.fire bazi.excess.water bazi.excess.wood bazi.god.QS num.bday.10 num.bday.19 thai.day.6 thai.rasi.0 thai.rasi.3 thai.rasi.7",
      "social": "thai.day.2",
      "work": "bazi.excess.earth bazi.excess.metal"
    },
    "iching": {
      "love": "hex.15 rel.15",
      "love,money": "rel.21",
      "love,money,overview,timing,work": "hex.24 hex.40 rel.24 rel.40",
      "love,money,timing": "hex.21",
      "love,overview": "hex.51",
      "love,overview,timing": "hex.54 rel.51 rel.54",
      "love,overview,timing,work": "hex.18 hex.59 rel.18 rel.59",
      "love,timing,work": "hex.28 hex.38",
      "love,work": "rel.28 rel.38",
      "money": "hex.43 hex.46 rel.43 rel.46",
      "overview": "hex.9 tri.lower.gen tri.upper.gen",
      "overview,timing": "rel.9",
      "personality": "tri.lower.kan tri.upper.kan",
      "timing": "hex.17 hex.25 hex.27 hex.57 rel.17 rel.27 rel.57",
      "work": "hex.53 rel.53"
    },
    "lek7": {},
    "lifegraph": {
      "timing": "lg.next.care lg.next.love lg.next.money lg.next.work"
    },
    "numbers": {
      "love,social": "pair.02 pair.20",
      "overview,personality,work": "sum.57",
      "overview,social,work": "sum.34",
      "personality": "pair.09 pair.17 pair.71 pair.90",
      "personality,work": "pair.01 pair.10 pair.57 pair.75 pair.79 pair.97",
      "social,work": "pair.04 pair.34 pair.40 pair.43"
    },
    "palm": {
      "love": "spread.close",
      "love,money,timing": "element.water",
      "money": "head.long",
      "personality": "element.earth shape.palm.square thumbangle.narrow",
      "personality,timing,work": "element.fire",
      "timing": "life.close life.joined",
      "timing,work": "element.air",
      "work": "head.sloping"
    },
    "siamsee": {
      "love": "siamsee.24",
      "love,money,overview,work": "siamsee.17",
      "love,overview": "siamsee.14",
      "overview": "siamsee.23 siamsee.5 siamsee.6",
      "overview,work": "siamsee.19"
    },
    "taksa": {},
    "tarot": {
      "love": "cups10.r m10.r m20.r pentacles02.r pentacles04 pentacles07.r pentacles12.r swords01.r swords06.r wands04.r wands09 wands09.r wands14.r",
      "love,money": "m13",
      "love,money,overview": "swords06",
      "love,overview,work": "cups08",
      "love,timing": "cups05.r m12 m15.r",
      "overview": "cups01.r cups06.r cups11.r m01.r m06.r m11.r m21.r pair.m04+pentacles04 pair.m08+m11 pair.m11+m14 pair.wands05+wands06 pentacles03.r pentacles08.r" +
        " " + "pentacles13.r swords07.r",
      "overview,timing": "swords02.r wands05.r wands10.r",
      "timing": "m12.r m16.r pentacles05.r swords02 swords03.r swords05.r swords08.r swords09.r swords10.r wands05",
      "work": "cups04"
    },
    "zodiac": {}
  });
  /** @type {Record<string, Record<string, string[]>>} */
  const MAP = {};
  for (const d in TAGS) { MAP[d] = {}; for (const areas in TAGS[d]) for (const id of TAGS[d][areas].split(" ")) MAP[d][id] = (MAP[d][id] || []).concat(areas.split(",")); }
  const key = (/** @type {string} */ d, /** @type {any} */ id) => (d === "tarot" ? String(id).replace(/^card\.[a-z]+\./, "") : String(id));
  /** the tagged areas of one fact item, or null @param {string} d @param {any} it */
  // a numbers digit-sum item (sum.NN) reads like its pair (pair.NN): it takes the pair's areas plus its overview
  const of = (d, it) => {
    if (!it || !MAP[d]) return null;
    const k = key(d, it.id), m = d === "numbers" && /^sum\.(\d\d)$/.exec(k), p = m && MAP[d]["pair." + m[1]];
    return MAP[d][k] || (p ? [...new Set(p.concat("overview"))] : null);
  };
  const count = () => Object.values(MAP).reduce((n, m) => n + Object.values(m).reduce((a, b) => a + b.length, 0), 0);
  const ids = () => Object.fromEntries(Object.entries(MAP).map(([d, m]) => [d, Object.keys(m)]));
  /** the text of every tagged area in a fact set, in the reading language; tr(item) -> that language's item */
  function sources(/** @type {any} */ F, /** @type {(it: any) => any} */ tr) {
    const out = /** @type {string[]} */ ([]);
    for (const it of (F && F.items) || []) {
      const a = of(F.domain, it); if (!a) continue;
      const ms = ((tr ? tr(it) : it) || it).meanings || {};
      for (const k of a) for (const t of [].concat(ms[k] || [])) if (t) out.push(String(t));
    }
    return out;
  }
  const API = { REVIEWED, TAGS, of, key, count, ids, sources };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else /** @type {any} */ (root).LQFortuneNeg = API;
})(typeof window !== "undefined" ? window : globalThis);

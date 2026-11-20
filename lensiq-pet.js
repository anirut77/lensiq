/* lensiq-pet.js — LQPet: pure logic of the Pet face reading for dogs and cats (petread.html, owner order 2026-11-16 part B).
 * Browser: window.LQPet · Node: module.exports. No storage, no upload: the photo never leaves the page.
 *
 * Adapted from face-reading tradition, not a classical text (HONEST). The owner picks the traits (species, coat, marks, eyes,
 * ears, face, size, energy); a photo can pre-fill species and coat through the on-device detector. Hard limits (fixed tests
 * tests/unit/fortune-pet.test.js, tests/e2e/fortune-pet.e2e.mjs): nothing about health, illness, lifespan or death; nothing
 * that replaces a vet; the owner is never read from the photo (a person in it changes nothing in the reading); no numbers
 * to gamble with; no "bad luck" talk.
 *
 * API
 *   HONEST, DISC {th,en,zh} · LINK · TRAITS {species, coat, marks, eyes, ears, face, size, energy} · CLASSES {person, cat, dog}
 *   compose(input, {lang}) -> {lang, source:"local", domain:"pet", sections:[{id,title,paragraphs}], lucky:{colour:{planet,name,hex},
 *     day:{n,name}}, honest, disclaimer, reminder, notes:{human?}}
 *     input = {species, name, traits:{coat, marks[], eyes, ears, face, size, energy}, birth:"YYYY-MM-DD"|null, owner:{birth}|null, humanSeen}
 *     sections: overview, personality, likes, bond, lucky, compat (compat only with the owner's birth date, through
 *     LQCompat.pair(owner, pet, {mode:"owner-pet", lang}); window.LQCompat is looked up at call time, else lensiq-compat-stub.js)
 *   cardModel(result, {photo=false, theme, size, template?}) -> plain data for the share card (lensiq-pet-card.js; template = a
 *     zodiac card id: adds {template, from} only, the reading strings never change) · cardText(model) -> strings drawn
 *   pickDetections(dets) -> {pet, species, persons}   YOLOX classes person 0 / cat 15 / dog 16
 *   loadDetector() -> Promise<model> (browser: loads vendor/ort + lensiq-detect.js + YOLOX-Nano on first call only)
 *   detect(model, img) -> Promise<pickDetections()> · coatGuess(src, box) -> coat key | null (a hint the owner confirms)
 *   lint(text, lang) -> [hits]   the module's own copy of the hard limits; compose() drops any line that hits (fail-safe)
 *   taksaSri(planet) -> planet of the Sri house (Taksa wheel, same rule as lensiq-luckycolor.js taksa().sri)
 */
(function (root) {
  "use strict";
  const KB = ((typeof module !== "undefined" && module.exports && typeof require === "function") ? require("./lensiq-pet-kb.js") : root.LQPetKB) || null;
  const HONEST = {
    th: "คำอ่านนี้ดัดแปลงจากความเชื่อเรื่องการดูลักษณะ ไม่ใช่ตำราดั้งเดิม",
    en: "Adapted from face-reading tradition, not a classical text.",
    zh: "改编自相术传统，并非古籍原文。",
  };
  // the final fortune disclaimer (fortune-notice.js LINE, owner order 2026-11-15)
  const DISC = {
    th: "เป็นหลักโหราศาสตร์ ซึ่งเป็นความเชื่อส่วนบุคคล โปรดใช้วิจารณญาณ",
    en: "Based on astrological principles, which are a matter of personal belief. Please use your own judgement.",
    zh: "基于命理学原则，属个人信仰，请自行判断。",
  };
  const LINK = "https://anirut77.github.io/lensiq/petread.html";
  const CLASSES = { person: 0, cat: 15, dog: 16 };
  const TRAITS = { species: ["cat", "dog"] };
  // the detector half works without the content file (the bench loads lensiq-pet.js alone); the reading needs lensiq-pet-kb.js
  if (KB) for (const k of ["coat", "marks", "eyes", "ears", "face", "size", "energy"]) TRAITS[k] = Object.keys(KB.labels[k]);
  const PLANET_HEX = ["#e03131", "#f2b705", "#e64980", "#2f9e44", "#f76707", "#4dabf7", "#7048e8", "#868e96"]; // = LQLucky.PLANETS
  const ORDER = [0, 1, 2, 3, 6, 4, 7, 5]; // Taksa wheel: อาทิตย์ จันทร์ อังคาร พุธ เสาร์ พฤหัสบดี ราหู ศุกร์ (บริวาร อายุ เดช ศรี …)
  const taksaSri = planet => ORDER[(ORDER.indexOf(planet) + 3) % 8];
  const langOf = l => (l === "en" || l === "zh" ? l : "th");

  /* ---- the hard limits (the fixed tests carry their own, stricter copy) ---- */
  const LINT = {
    th: new RegExp([
      "สุขภาพ|ป่วย|โรค|อาการ|เจ็บ|ปวด|ตาย|เสียชีวิต|อายุ|สัตวแพทย์|หมอ|รักษา|ให้ยา|กินยา|วัคซีน|ทำหมัน",
      "แข็งแรง|ร่างกาย|น้ำหนัก|อ้วน|ผอม|ใบหน้าของคุณ|หน้าตาของคุณ|เลขเด็ด|เลขนำโชค|หวย|ซวย|โชคร้าย|กาลกิณี|อัปมงคล|เคราะห์"
    ].join("|")),
    en: new RegExp([
      "\\b(?:health\\w*|ill|illness\\w*|sick\\w*|disease\\w*|vets?|veterinar\\w*|lifespan|longevity|long life|die[sd]?|dying|death|dead|cure\\w*|treatment\\w*",
      "medic\\w*|symptom\\w*|weight|vaccin\\w*|injur\\w*|pain(?:s|ful)?|diet\\w*|your face|lucky numbers?|lottery|bad luck|misfortune|unlucky|curse\\w*)\\b"
    ].join("|"), "i"),
    zh: /健康|疾病|病|兽医|医|寿|死|去世|治疗|药|症状|疫苗|体重|肥胖|受伤|疼|你的脸|彩票|幸运数字|倒霉|晦气|不吉|厄运/,
  };
  function lint(text, lang) { const m = String(text || "").match(LINT[langOf(lang)]); return m ? [m[0]] : []; }

  /* ---- helpers ---- */
  function hash(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; }
  function weekday(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || "")); if (!m) return -1;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); return isNaN(d.getTime()) ? -1 : d.getUTCDay();
  }
  const pick = (arr, h) => (Array.isArray(arr) ? arr[h % arr.length] : arr);
  const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  function fill(t, v) { return String(t).replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m)); }
  function norm(input) {
    const i = input || {}, tr = i.traits || {};
    const sp = TRAITS.species.includes(i.species) ? i.species : "cat";
    const one = (k, d) => (TRAITS[k].includes(tr[k]) ? tr[k] : d);
    return { species: sp, name: String(i.name || "").replace(/\s+/g, " ").trim().slice(0, 30),
      traits: { coat: one("coat", "tabby"), marks: (Array.isArray(tr.marks) ? tr.marks : []).filter(m => TRAITS.marks.includes(m)).sort(),
        eyes: one("eyes", sp === "dog" ? "brown" : "gold"), ears: one("ears", "up"), face: one("face", "round"), size: one("size", "medium"), energy: one("energy", "playful") },
      birth: weekday(i.birth) >= 0 ? i.birth : null, owner: i.owner && weekday(i.owner.birth) >= 0 ? { birth: i.owner.birth } : null, humanSeen: !!i.humanSeen };
  }
  function folkLine(x, lang) {
    for (const f of KB.folk) {
      if (f.sp !== x.species) continue;
      if (f.coat && f.coat !== x.traits.coat) continue;
      if (f.mark && !x.traits.marks.includes(f.mark)) continue;
      return f[lang];
    }
    return "";
  }
  const compatApi = () => root.LQCompat || ((typeof require === "function" && typeof module !== "undefined" && module.exports) ? require("./lensiq-compat-stub.js") : null);

  function compose(input, opts) {
    const lang = langOf(opts && opts.lang), x = norm(input), t = x.traits;
    const h = hash([x.species, t.coat, t.marks.join("+"), t.eyes, t.ears, t.face, t.size, t.energy, x.birth || "", x.name].join("|"));
    // in English / Chinese a name typed in Thai script stays out of the sentences (the reading is all in one language)
    const own = lang !== "th" && /[\u0E00-\u0E7F]/.test(x.name) ? "" : x.name;
    const name = own || KB.defName[x.species][lang];
    const v = { n: name, N: lang === "en" ? cap(name) : name, sp: KB.species[x.species][lang] };
    const F = s => { const o = fill(s, v); return lang === "en" ? cap(o) : o; };
    const join = parts => parts.filter(Boolean).join(lang === "zh" ? "" : " ");
    const C = KB.coat[t.coat], T = KB.titles[lang];
    const sections = [];
    const add = (id, paragraphs) => {
      const ps = paragraphs.map(F).filter(p => p && !lint(p, lang).length);
      if (ps.length) sections.push({ id, title: T[id], paragraphs: ps });
    };
    const folk = folkLine(x, lang);
    add("overview", [fill(KB.overview[lang], { lead: folk, n: name, N: v.N, sp: v.sp })]);
    add("personality", [pick(C.p[lang], h), join([KB.eyes[t.eyes][lang], KB.ears[t.ears][lang], KB.face[t.face][lang]])]);
    add("likes", [join([C.l[lang], KB.size[t.size][lang]]), KB.energy[t.energy].l[lang]]);
    add("bond", [C.b[lang], KB.energy[t.energy].b[lang]]);
    // lucky colour and day: the Sri house of the pet's birth weekday (Taksa); without a birth date, the coat's planet
    const bd = weekday(x.birth), planet = bd >= 0 ? taksaSri(bd) : C.planet;
    const day = { n: planet === 7 ? 3 : planet, name: KB.planets[lang][planet] };
    const colour = { planet, name: KB.colours[lang][planet], hex: PLANET_HEX[planet] };
    const lv = { n: name, N: v.N, colour: colour.name, day: day.name, born: bd >= 0 ? (lang === "en" ? KB.planets.en[bd] : KB.planets[lang][bd]) : "" };
    add("lucky", [fill(bd >= 0 ? KB.lucky.born[lang] : KB.lucky.coat[lang], lv), fill(KB.lucky.use[lang], lv)]);
    // owner-pet compatibility (part A interface); only the owner's own birth date, never the photo
    if (x.owner) {
      const CA = compatApi();
      let res = null;
      try { res = CA && CA.pair({ birth: x.owner.birth, kind: "person" }, { birth: x.birth, kind: "pet", species: x.species }, { mode: "owner-pet", lang }); } catch (e) { res = null; }
      const lines = res && Array.isArray(res.lines) ? res.lines.map(String) : [];
      if (lines.length) add("compat", lines.concat([KB.compatFoot[lang]]));
    }
    const out = { lang, source: "local", domain: "pet", species: x.species, coat: t.coat, eyes: t.eyes, ears: t.ears, name: own, typedName: x.name, sections, lucky: { colour, day },
      honest: HONEST[lang], disclaimer: DISC[lang], reminder: KB.reminder[lang], notes: {} };
    if (x.humanSeen) out.notes.human = KB.human[lang];
    return out;
  }

  /* ---- the share card's data (drawn by lensiq-pet-card.js) ---- */
  const CARD_T = {
    title: { th: "ดูลักษณะน้อง{sp} · LENSIQ", en: "Pet face reading · LENSIQ", zh: "宠物相术 · LENSIQ" },
    lucky: { th: "สีมงคล {c} · วันดี {d}", en: "Lucky colour {c} · good day {d}", zh: "幸运色 {c} · 好日子 {d}" },
  };
  /** the card's data. petName = the name the owner typed, in whatever script (it is the owner's own word, drawn as the
   *  headline and never linted or translated); every other string is generated in the page language (cardText). */
  function cardModel(res, opts) {
    const o = opts || {}, lang = langOf(res && res.lang);
    const sec = id => ((res.sections || []).find(s => s.id === id) || { paragraphs: [] }).paragraphs;
    const sp = res.species || "cat", coat = res.coat || "orange";
    const lines = [sec("personality")[0], sec("likes")[1] || sec("likes")[0], sec("bond")[0]].filter(Boolean);
    const lk = res.lucky || {}, typed = String(res.typedName || "").trim();
    const hl = KB && KB.headline && KB.headline[coat] ? KB.headline[coat][lang] : "";
    const m = {
      lang, species: sp, coat, eyes: res.eyes || "gold", ears: res.ears || "up", photo: !!o.photo, theme: o.theme || "sunny", size: o.size || "post",
      petName: typed || KB.defName[sp][lang].replace(/^./, c => (lang === "en" ? c.toUpperCase() : c)),
      headline: hl, title: fill(CARD_T.title[lang], { sp: KB.species[sp][lang] }),
      lines, lucky: lk.colour ? fill(CARD_T.lucky[lang], { c: lk.colour.name, d: lk.day.name }) : "",
      hex: lk.colour ? lk.colour.hex : "#f2b705",
      honest: HONEST[lang], disclaimer: DISC[lang], link: LINK,
    }, tpl = o.template ? String(o.template) : "";
    // zodiac card mode (owner spec 2026-11-19): the template only changes the look; every reading string above stays the same.
    // Footer "จาก LENSIQ" + the site address from the one setting (LINK); FROM is the same text as LQPetDraw.FROM.
    if (tpl) { m.template = tpl; m.from = FROM[lang] + " · " + LINK.replace(/^https:\/\//, ""); }
    return m;
  }
  const FROM = { th: "จาก LENSIQ", en: "From LENSIQ", zh: "来自 LENSIQ" };
  function cardText(m) { return [m.title, m.headline].concat(m.lines, m.lucky ? [m.lucky] : [], [m.honest, m.disclaimer, m.from || m.link]).filter(Boolean); }

  /* ---- detections ---- */
  // privacy (review round 1, D1): every person box at or above PRIVACY_MIN is blurred on the card, far below the 0.4 used for
  // the on-page note; the detector itself is run at PRIVACY_MIN so that nothing above it is lost
  const PRIVACY_MIN = 0.1;
  function pickDetections(dets, o) {
    const min = (o && o.min) || 0.1, pmin = (o && o.personMin) || 0.4;
    const ds = Array.isArray(dets) ? dets : [];
    const pets = ds.filter(d => (d.cls === CLASSES.cat || d.cls === CLASSES.dog) && d.score >= min).sort((a, b) => b.score - a.score);
    const blur = ds.filter(d => d.cls === CLASSES.person && d.score >= PRIVACY_MIN);
    const persons = blur.filter(d => d.score >= pmin);
    const pet = pets[0] || null;
    return { pet, species: pet ? (pet.cls === CLASSES.cat ? "cat" : "dog") : null, persons, blur };
  }
  function loadScript(src) {
    return new Promise((ok, no) => {
      const d = root.document; if (!d) return no(new Error("no document"));
      const s = d.createElement("script"); s.src = src; s.async = true; s.onload = () => ok(); s.onerror = () => no(new Error("could not load " + src)); d.head.appendChild(s);
    });
  }
  let modelP = null;
  function loadDetector() {
    if (modelP) return modelP;
    modelP = (async () => {
      if (!root.ort) await loadScript("vendor/ort/ort.wasm.min.js");
      if (!root.LQDetect) await loadScript("lensiq-detect.js?v=6");
      return root.LQDetect.loadYolox();
    })();
    modelP.catch(() => { modelP = null; });
    return modelP;
  }
  // thresholds chosen on the DEV split only (tests/bench/pet-dev.tune.mjs, 148 Oxford-IIIT Pet images disjoint from the locked
  // set): 0.1 finds 95.9 % of the pets there (0.3: 92.6 %) with the head inside the box in 98.6 %
  async function detect(model, img) {
    // two passes: pets on their own, people on their own, so that a person box can never be removed by the overlap
    // suppression of a higher-scoring pet box (a person holding the pet must still be found and blurred)
    const pets = await root.LQDetect.detectYolox(model, img, { classes: [CLASSES.cat, CLASSES.dog], minScore: 0.1, max: 20 });
    const people = await root.LQDetect.detectYolox(model, img, { classes: [CLASSES.person], minScore: PRIVACY_MIN, max: 30 });
    return pickDetections(pets.concat(people));
  }
  /** a coat-colour hint from the centre of the pet box (the owner confirms or changes it) */
  function coatGuess(src, box) {
    try {
      const d = root.document, W = src.naturalWidth || src.videoWidth || src.width, H = src.naturalHeight || src.videoHeight || src.height;
      if (!d || !W || !H || !box) return null;
      const c = d.createElement("canvas"); c.width = 32; c.height = 32;
      const x = c.getContext("2d", { willReadFrequently: true });
      x.drawImage(src, (box.x + box.w * 0.25) * W, (box.y + box.h * 0.3) * H, box.w * 0.5 * W, box.h * 0.5 * H, 0, 0, 32, 32);
      const px = x.getImageData(0, 0, 32, 32).data;
      // one vote per pixel (a white chest or a lead across the fur must not tint the average), then the largest share wins
      const votes = { black: 0, white: 0, grey: 0, orange: 0, brown: 0, cream: 0 };
      let n = 0;
      for (let i = 0; i < px.length; i += 4) {
        const r = px[i] / 255, g = px[i + 1] / 255, b = px[i + 2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
        const s = mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1));
        let h = 0; if (mx !== mn) { h = mx === r ? ((g - b) / (mx - mn)) % 6 : mx === g ? (b - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4; h *= 60; if (h < 0) h += 360; }
        n++;
        if (l < 0.2) votes.black++;
        else if (s < 0.15 || l > 0.85) votes[l > 0.72 ? "white" : "grey"]++;
        else if (h >= 10 && h <= 55) votes[l > 0.68 && s < 0.5 ? "cream" : l > 0.42 ? "orange" : "brown"]++;
      }
      const top = Object.entries(votes).sort((p, q) => q[1] - p[1]);
      if (votes.black / n >= 0.3 && votes.white / n >= 0.2) return "bicolour";
      return top[0][1] / n >= 0.35 ? top[0][0] : null;
    } catch (e) { return null; }
  }

  const api = { HONEST, DISC, LINK, CLASSES, PRIVACY_MIN, TRAITS, PLANET_HEX, compose, cardModel, cardText, pickDetections, loadDetector, detect, coatGuess, lint, taksaSri, weekday, KB };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.LQPet = api;
})(typeof window !== "undefined" ? window : globalThis);

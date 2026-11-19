"use strict";
// tests/unit/pet-zodiac.test.js — FIXED TEST SET for the Pet zodiac share cards (owner spec 2026-11-19, branch pet-zodiac-cards).
// Locked (evals-locks/pet-zodiac.sha256, ~/LENSIQ-field/evals/pet-zodiac/) BEFORE any product code. Browser half:
// tests/e2e/pet-zodiac.e2e.mjs. Inputs are synthetic (no photos).
// RE-LOCK 1 (2026-11-19, owner decisions 137 ข and 138 ข, before any product commit): option b (the day's zodiac animal x2,
// secret 1 in 50, 1 in 10 on full-moon days) is the DEFAULT; the birthday rule (old option c) is removed entirely (a typed
// birthday can be set to today); one short odds line generated from the active config; the classic themes stay behind
// PET_CARD_CLASSIC (default false). Changed: Z2, Z3, Z5, Z6, Z8 (birthday marker lines removed), Z11; the rest
// is unchanged.
// RE-LOCK 2 (2026-11-19, independent review round 1 FAILED on bdeeed49), Z6 only, stricter: the line names the full-moon rule
// on every day (ordinary days: a short clause with the config's full-moon rate) and always with the approximation word
// (TH "วันเพ็ญ โดยประมาณ" / EN "approx. full-moon day" / ZH "约满月日"); every percentage is the day's odds or that full-moon
// rate; the length limits are unchanged.
//   Z1  13 templates: the 12 Chinese zodiac animals in branch order (rat … pig) + "secret"; names in TH / EN / ZH; the secret
//       card's words are exactly "การ์ด Secret" / "Secret Card" / "隐藏卡"
//   Z2  the draw is a pure module (lensiq-pet-draw.js) with an odds config object; DEFAULT config "b" (owner decision 137 ข);
//       preset "a" (12 equal, secret 1 in 50, no date rule) kept for comparison; odds always sum to 1
//   Z3  distribution: 100 000 draws of the default config on an ordinary day with crypto.getRandomValues match the config
//       (chi-square, 12 df, below 40 = p < 0.0001) and the secret rate is within ±0.3 percentage points of 2 %; no Math.random
//   Z4  option b: the zodiac animal of the day (12-day branch cycle, same as horoscope.js HSCore.dayPillarJDN) gets double
//       weight; on full-moon days (the site's own "ขึ้น 15 ค่ำ" rule, lensiq-planner.js lunarDay) the secret is 1 in 10
//   Z5  no birthday rule anywhere (owner decision 137 ข): no preset has it, a birth date on today's month-day changes nothing
//   Z6  the one short odds line is generated from the active config (TH / EN / ZH): every percentage in it is one of the
//       config's odds for that day and the day's animal, the x2 and the full-moon 1 in 10 are stated when they apply; plus the
//       "independent of the reading" line; no rarity words
//   Z7  the reading never changes because of the card: the card model's reading text is identical for all 13 templates
//   Z8  collection storage: only template ids + first-found date (YYYY-MM-DD); try/catch around storage; no image data
//   Z9  TH / EN / ZH keys complete for every data-i18n key on petread.html and every pet.z.* key in petread.js
//   Z10 no price / buy / pay words or links near the card (card section markup, the new modules, the pet.z.* strings)
//   Z11 flags: window.LENSIQ_PET_ZODIAC default false; window.LENSIQ_PET_CARD_CLASSIC (spec name PET_CARD_CLASSIC) default
//       false; the 4 classic themes and their buttons are kept; odds preset switch window.LENSIQ_PET_ZODIAC_ODDS default "b"
//   Z12 lazy: petread.html loads neither the draw module nor the template art; petread.js loads them on demand only
//   Z13 licence: the template art is recorded as original, LENSIQ in LICENSES/THIRD_PARTY.md
//   Z14 the art module defines 13 distinct styles (colours, border, stickers) and an illustration for each template
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const exists = f => fs.existsSync(path.join(ROOT, f));
const LANGS = ["th", "en", "zh"];
const THAI = /[฀-๿]/;
const ZODIAC = ["rat", "ox", "tiger", "rabbit", "dragon", "snake", "horse", "goat", "monkey", "rooster", "dog", "pig"];
const ALL = ZODIAC.concat(["secret"]);
const SECRET = { th: "การ์ด Secret", en: "Secret Card", zh: "隐藏卡" };
const D = () => require("../../lensiq-pet-draw.js");
const P = require("../../lensiq-pet.js");
const HS = require("../../horoscope.js");
const PL = require("../../lensiq-planner.js");

const BAN = {
  th: /สุขภาพ|ป่วย|โรค|ตาย|อายุ|สัตวแพทย์|ซวย|โชคร้าย|กาลกิณี|เลขเด็ด|หวย|หายาก|แรร์/,
  en: /\b(?:health\w*|sick\w*|disease\w*|vets?|die[sd]?|death|dead|bad luck|unlucky|lottery|rare|rarest|ultra|legendary)\b/i,
  zh: /健康|疾病|病|兽医|死|倒霉|不吉|彩票|稀有|罕见|传说/,
};
const MONEY = /ราคา|บาท|ซื้อ|จ่าย|ชำระ|โอนเงิน|พรีเมียม|ปลดล็อก|\bprice\w*|\bbuy\b|\bbuying\b|\bpay\b|\bpaid\b|\bpayment\w*|\bpurchase\w*|\bpremium\b|\bunlock\w*|฿|\$\s?\d|元|购买|付款|支付|价格|付费|解锁/i;

const pad = n => String(n).padStart(2, "0");
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
function* days(y0, y1) {
  for (let t = Date.UTC(y0, 0, 1); t < Date.UTC(y1 + 1, 0, 1); t += 86400000) {
    const d = new Date(t); yield [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
  }
}
const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const pet = (coat, name = "") => ({ species: "cat", name, traits: { coat, marks: [], eyes: "green", ears: "up", face: "round", size: "small", energy: "calm" },
  birth: "2021-03-14", owner: null });

test("Z1 13 templates: 12 zodiac animals in branch order + secret; names in TH / EN / ZH; exact secret words", () => {
  const M = D();
  assert.deepEqual(M.ZODIAC, ZODIAC);
  assert.deepEqual(M.TEMPLATES, ALL);
  for (const id of ALL) for (const l of LANGS) {
    const n = M.label(id, l);
    assert.ok(typeof n === "string" && n.trim().length >= 2, `${id} ${l} label`);
    if (l !== "th") assert.doesNotMatch(n, THAI, `${id} ${l} label has Thai`);
    assert.doesNotMatch(n, BAN[l], `${id} ${l} label`);
  }
  for (const l of LANGS) assert.ok(M.label("secret", l).includes(SECRET[l]), `secret label ${l} must contain "${SECRET[l]}"`);
  // labels are distinct per language
  for (const l of LANGS) assert.equal(new Set(ALL.map(id => M.label(id, l))).size, 13, l + " labels distinct");
});

test("Z2 pure draw module with an odds config; default b (day animal x2, secret 1 in 50 / 1 in 10 on full moon); odds sum to 1", () => {
  const M = D();
  assert.equal(M.DEFAULT, "b");
  assert.deepEqual(Object.keys(M.CONFIGS).sort(), ["a", "b"], "presets a and b only (no birthday preset)");
  const bb = M.CONFIGS.b;
  assert.ok(ZODIAC.every(z => bb.weights[z] === bb.weights.rat) && bb.dayBranchFactor === 2 && close(bb.secret, 1 / 50) && close(bb.fullMoonSecret, 1 / 10), "b as decided");
  for (const k of ["a", "b"]) {
    const c = M.CONFIGS[k];
    assert.ok(c && typeof c === "object" && c.weights && typeof c.secret === "number", "config " + k);
    assert.deepEqual(Object.keys(c.weights).sort(), ZODIAC.slice().sort(), k + " weights per zodiac template");
  }
  assert.equal(M.config("nope"), M.CONFIGS.b, "unknown preset -> the default b");
  assert.equal(M.config(undefined), M.CONFIGS.b, "no preset -> the default b");
  const a = M.CONFIGS.a;
  assert.ok(ZODIAC.every(z => a.weights[z] === a.weights.rat), "a: equal zodiac weights");
  assert.ok(close(a.secret, 1 / 50), "a: secret 1 in 50");
  for (const today of ["2026-11-19", "2025-11-05", "2026-03-14"]) for (const k of ["a", "b"]) {
    const o = M.odds(M.CONFIGS[k], { today, birth: "2021-03-14", birthdayDone: false });
    assert.deepEqual(Object.keys(o.p).sort(), ALL.slice().sort());
    assert.ok(close(sum(o.p), 1, 1e-12), `${k} ${today} sums to 1`);
  }
  const o = M.odds(a, { today: "2026-11-19" });
  assert.ok(close(o.p.secret, 0.02) && ZODIAC.every(z => close(o.p[z], 0.98 / 12)), "a: 0.98 / 12 each, 0.02 secret");
  // deterministic with an injected random number
  assert.equal(M.draw(a, { today: "2026-11-19" }, () => 0).id, "rat");
  assert.equal(M.draw(a, { today: "2026-11-19" }, () => 0.999999).id, "secret");
  // the module is pure: no DOM, storage or network at load
  const s = read("lensiq-pet-draw.js");
  assert.doesNotMatch(s, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|document\.|\.innerHTML/, "pure module");
});

test("Z3 100 000 draws of the default config (ordinary day) with crypto.getRandomValues: chi-square < 40 (12 df), secret ±0.3 pp of 2 %", () => {
  const M = D();
  const src = read("lensiq-pet-draw.js").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(src, /Math\.random/, "no Math.random in the draw");
  assert.match(src, /getRandomValues/, "crypto.getRandomValues");
  const real = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
  let calls = 0;
  const spy = a => { calls++; return real(a); };
  Object.defineProperty(globalThis.crypto, "getRandomValues", { value: spy, configurable: true, writable: true });
  const N = 100000, n = Object.fromEntries(ALL.map(k => [k, 0]));
  assert.ok(!M.isFullMoonDay("2026-11-19"), "2026-11-19 is an ordinary day");
  const cfg = M.config(M.DEFAULT);
  try { for (let i = 0; i < N; i++) n[M.draw(cfg, { today: "2026-11-19" }).id]++; }
  finally { Object.defineProperty(globalThis.crypto, "getRandomValues", { value: real, configurable: true, writable: true }); }
  assert.ok(calls >= N, `getRandomValues used for every draw (${calls} calls)`);
  const p = M.odds(cfg, { today: "2026-11-19" }).p;
  let chi = 0; for (const k of ALL) { const e = N * p[k]; chi += (n[k] - e) ** 2 / e; }
  assert.ok(chi < 40, `chi-square ${chi.toFixed(2)} >= 40 (counts ${JSON.stringify(n)})`);
  const rate = n.secret / N;
  assert.ok(Math.abs(rate - 0.02) <= 0.003, `secret rate ${(rate * 100).toFixed(3)} %`);
});

test("Z4 option b: the day's branch animal x2 (same cycle as HSCore.dayPillarJDN); secret 1 in 10 on full-moon days (lunarDay ขึ้น 15)", () => {
  const M = D(), b = M.CONFIGS.b;
  assert.equal(M.dayBranch("2000-01-01"), 6, "2000-01-01 is a 午 (horse) day");
  assert.equal(M.dayBranch("1900-01-01"), 10, "1900-01-01 is a 戌 (dog) day");
  let full = 0; const perYear = {};
  for (const [y, m, d] of days(2024, 2027)) {
    const t = iso(y, m, d);
    assert.equal(M.dayBranch(t), HS.dayPillarJDN(HS.jdn(y, m, d)).branch, "branch " + t);
    const ld = PL.lunarDay(y, m, d), want = ld.waxing && ld.day === 15;
    assert.equal(M.isFullMoonDay(t), want, "full moon " + t);
    if (want) { full++; perYear[y] = (perYear[y] || 0) + 1; }
  }
  for (const y of [2024, 2025, 2026, 2027]) assert.ok(perYear[y] >= 12 && perYear[y] <= 13, `${y}: ${perYear[y]} full-moon days`);
  assert.ok(M.isFullMoonDay("2025-11-05") && M.isFullMoonDay("2024-11-15"), "Loy Krathong 2025 / 2024 are full-moon days");
  assert.ok(!M.isFullMoonDay("2025-11-04") && !M.isFullMoonDay("2025-11-06"));
  // odds on an ordinary day and on a full-moon day
  for (const t of ["2026-11-19", "2025-11-05"]) {
    const o = M.odds(b, { today: t }).p, z = ZODIAC[M.dayBranch(t)];
    const others = ZODIAC.filter(k => k !== z);
    assert.ok(others.every(k => close(o[k], o[others[0]])), "others equal");
    assert.ok(close(o[z] / o[others[0]], 2), `${t}: ${z} has double weight`);
    assert.ok(close(o.secret, M.isFullMoonDay(t) ? 0.1 : 0.02), `${t}: secret ${o.secret}`);
  }
  // 100 000 draws on a full-moon day: the secret near 10 %
  let s = 0; for (let i = 0; i < 100000; i++) if (M.draw(b, { today: "2025-11-05" }).id === "secret") s++;
  assert.ok(Math.abs(s / 100000 - 0.1) <= 0.006, `full-moon secret rate ${s / 1000} %`);
  // a: no date rule
  assert.ok(close(M.odds(M.CONFIGS.a, { today: "2025-11-05" }).p.secret, 0.02), "a ignores the full moon");
});

test("Z5 no birthday rule anywhere: a birth date on today's month-day changes nothing", () => {
  const M = D();
  assert.equal(M.isBirthday, undefined, "no birthday helper");
  assert.equal(M.markBirthday, undefined, "no birthday marker");
  for (const k of Object.keys(M.CONFIGS)) assert.ok(!("birthdaySecret" in M.CONFIGS[k]), k + " has no birthday rule");
  for (const k of Object.keys(M.CONFIGS)) {
    const a = M.odds(M.CONFIGS[k], { today: "2026-03-14", birth: "2021-03-14", birthdayDone: false });
    const b = M.odds(M.CONFIGS[k], { today: "2026-03-14" });
    assert.deepEqual(a.p, b.p, k + ": the birth date does not change the odds");
    assert.ok(!a.rule, k + ": no rule");
  }
  const s = read("lensiq-pet-draw.js") + read("petread.js");
  assert.doesNotMatch(s, /birthday|BDAY_KEY|petBirth[^"]*"\)\.value[^;]*draw/i, "no birthday rule code");
});

test("Z6 odds text is generated from the active config (TH / EN / ZH), says the card is independent of the reading, no rarity words", () => {
  const M = D();
  const cases = [
    [M.CONFIGS.a, { today: "2026-11-19" }, ["2%", "8.17%"]],
    [M.config(M.DEFAULT), { today: "2025-11-05" }, ["10%"]],
    [M.CONFIGS.b, { today: "2025-11-05" }, ["10%"]],
    [M.CONFIGS.b, { today: "2026-11-19" }, ["2%", "15.08%", "7.54%"]],
  ];
  for (const l of LANGS) {
    for (const [cfg, ctx, want] of cases) {
      const t = M.oddsText(cfg, ctx, l).join("\n");
      for (const w of want) assert.ok(t.includes(w), `${l} ${cfg.id} ${ctx.today}: "${w}" in\n${t}`);
      assert.doesNotMatch(t, BAN[l], l + " odds text");
      assert.doesNotMatch(t, MONEY, l + " odds text money");
      if (l !== "th") assert.doesNotMatch(t, THAI, l + " odds text has Thai");
    }
    // a made-up config: the text follows it (nothing hard-coded)
    const odd = Object.assign({}, M.CONFIGS.a, { id: "x", secret: 0.05 });
    assert.ok(M.oddsText(odd, { today: "2026-11-19" }, l).join("\n").includes("5%"), l + " follows the config");
    assert.ok(M.oddsText(odd, { today: "2026-11-19" }, l).join("\n").includes("7.92%"), l + " zodiac share follows the config");
  }
  // every percentage in the line is one of the config's odds that day; the day's animal and the full-moon rule are named
  const pct = x => (Math.round(x * 10000) / 100).toFixed(2).replace(/\.?0+$/, "") + "%";
  const NAME = { th: { horse: "ม้า" }, en: { horse: "Horse" }, zh: { horse: "马" } };
  const cfg = M.config(M.DEFAULT);
  for (const [y, m, d] of days(2025, 2026)) {
    const t = iso(y, m, d), o = M.odds(cfg, { today: t });
    const allowed = new Set(Object.values(o.p).map(pct).concat([pct(cfg.fullMoonSecret)]));
    const APPROX = { th: "วันเพ็ญ โดยประมาณ", en: "approx. full-moon day", zh: "约满月日" };
    for (const l of LANGS) {
      const lines = M.oddsText(cfg, { today: t }, l), first = lines[0];
      assert.ok(lines.length <= 2 && first.length <= (l === "zh" ? 70 : l === "th" ? 150 : 170), `${l} ${t}: one short line (+ the independent line) "${first}"`);
      const nums = first.match(/\d+(?:\.\d+)?%/g) || [];
      assert.ok(nums.length >= 2 && nums.every(n => allowed.has(n)), `${l} ${t}: ${first} vs ${[...allowed]}`);
      assert.ok(first.includes(pct(o.p.secret)) && first.includes(pct(o.p[o.dayAnimal])), `${l} ${t}: secret + day animal odds`);
      assert.ok(first.includes(M.short(o.dayAnimal, l)), `${l} ${t}: names the day's animal`);
      if (o.fullMoon) assert.ok(first.includes("10%"), `${l} ${t}: full-moon odds`);
      assert.ok(first.includes(APPROX[l]) && first.includes(pct(cfg.fullMoonSecret)), `${l} ${t}: the full-moon rule with the approximation word "${first}"`);
      assert.equal((first.match(new RegExp(pct(cfg.fullMoonSecret).replace(".", "\\."), "g")) || []).length, 1, `${l} ${t}: the full-moon rate once`);
    }
  }
  assert.equal(M.dayBranch("2000-01-01"), 6); assert.ok(M.oddsText(cfg, { today: "2000-01-01" }, "th")[0].includes(NAME.th.horse));
  assert.ok(M.oddsText(cfg, { today: "2000-01-01" }, "en")[0].includes(NAME.en.horse) && M.oddsText(cfg, { today: "2000-01-01" }, "zh")[0].includes(NAME.zh.horse));
  const ind = { th: /คำอ่าน/, en: /reading/i, zh: /解读/ };
  for (const l of LANGS) assert.match(M.INDEPENDENT[l], ind[l], l + " independent-of-the-reading line");
});

test("Z7 the reading never changes because of the card: card model reading text identical for all 13 templates", () => {
  for (const l of LANGS) for (const coat of ["orange", "black", "tabby"]) {
    const res = P.compose(pet(coat, "Mochi"), { lang: l });
    const base = P.cardModel(res, { theme: "sunny" });
    const pick = m => ({ lines: m.lines, headline: m.headline, lucky: m.lucky, honest: m.honest, disclaimer: m.disclaimer, petName: m.petName, link: m.link });
    for (const id of ALL) {
      const m = P.cardModel(res, { template: id });
      assert.deepEqual(pick(m), pick(base), `${l} ${coat} ${id}: reading text changed`);
      assert.equal(m.template, id, "the model carries the template id");
    }
    // compose takes no template / draw input
    assert.deepEqual(P.compose(pet(coat, "Mochi"), { lang: l, template: "secret" }).sections, res.sections);
  }
  const s = read("lensiq-pet-draw.js");
  assert.doesNotMatch(s, /compose|sections|paragraph/, "the draw module does not touch the reading");
});

test("Z8 collection storage: ids + first-found date only; try/catch; no image data; first date kept", () => {
  const M = D();
  const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m }; };
  const s = mem();
  assert.deepEqual(M.loadCollection(s), {});
  assert.equal(M.recordFind(s, "tiger", "2026-11-19").isNew, true);
  assert.equal(M.recordFind(s, "tiger", "2026-11-20").isNew, false);
  M.recordFind(s, "secret", "2026-11-21");
  M.recordFind(s, "unicorn", "2026-11-21");
  M.recordFind(s, "rat", "not-a-date");
  assert.deepEqual(M.loadCollection(s), { tiger: "2026-11-19", secret: "2026-11-21" });
  for (const [k, v] of s.m) {
    assert.match(k, /^lq-pet-zodiac/, "key prefix");
    assert.ok(v.length < 600, "small value");
    assert.doesNotMatch(v, /data:|base64|image|png|jpe?g|blob:|photo|name/i, "no image or name data: " + v);
    const j = JSON.parse(v);
    const flat = typeof j === "string" ? { d: j } : j;
    for (const [kk, vv] of Object.entries(flat.found || flat)) {
      if (kk === "v") continue;
      assert.ok(ALL.includes(kk) || kk === "d", "only template ids: " + kk);
      assert.match(String(vv), /^\d{4}-\d\d-\d\d$/, "only dates");
    }
  }
  // storage that throws, garbage JSON, no storage
  const bad = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("x"); } };
  assert.deepEqual(M.loadCollection(bad), {});
  assert.doesNotThrow(() => M.recordFind(bad, "ox", "2026-11-19"));
  const g = mem(); g.setItem(M.STORE_KEY, "{not json"); assert.deepEqual(M.loadCollection(g), {});
  g.setItem(M.STORE_KEY, JSON.stringify({ v: 1, found: { ox: "2026-01-01", evil: "data:image/png;base64,AAAA", pig: "data:x" } }));
  assert.deepEqual(M.loadCollection(g), { ox: "2026-01-01" });
  assert.deepEqual(M.loadCollection(null), {});
  const src = read("lensiq-pet-draw.js") + read("petread.js");
  assert.doesNotMatch(src, /setItem\([^)]*(?:toDataURL|photo|image|img|petName)/i, "no photo or name in storage");
});

test("Z9 TH / EN / ZH keys complete: every data-i18n key on petread.html and every pet.z.* key in petread.js", () => {
  const h = read("petread.html"), js = read("petread.js");
  const dict = l => { const W = { LQI18N_Q: [] }; vm.runInNewContext(read(`i18n/${l}-petread.js`), { window: W }); return Object.assign({}, ...W.LQI18N_Q.map(o => o[l])); };
  const en = dict("en"), zh = dict("zh");
  const keys = new Set();
  for (const m of h.matchAll(/data-i18n="([^"]+)"/g)) keys.add(m[1]);
  for (const m of h.matchAll(/data-i18n-attr="[^":]+:([^"]+)"/g)) keys.add(m[1]);
  const zkeys = [...js.matchAll(/T\(\s*"(pet\.z[^"]*)"/g)].map(m => m[1]);
  assert.ok(zkeys.length >= 4, "petread.js has pet.z.* strings");
  for (const k of zkeys) keys.add(k);
  for (const m of h.matchAll(/data-i18n="(pet\.z[^"]*)"/g)) keys.add(m[1]);
  assert.ok([...keys].some(k => k.startsWith("pet.z")), "the zodiac UI has i18n keys");
  const ownKeys = [...keys].filter(k => k.startsWith("pet."));
  for (const k of ownKeys) {
    assert.ok(typeof en[k] === "string" && en[k].trim(), "en missing " + k);
    assert.ok(typeof zh[k] === "string" && zh[k].trim(), "zh missing " + k);
    assert.doesNotMatch(en[k], THAI, "en has Thai " + k);
    assert.doesNotMatch(zh[k], THAI, "zh has Thai " + k);
    const ph = s => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(",");
    assert.equal(ph(en[k]), ph(zh[k]), "placeholders " + k);
  }
  // the card footer "จาก LENSIQ" in three languages, with the site address from the one setting (LQPet.LINK)
  const M = D();
  assert.equal(M.FROM.th, "จาก LENSIQ"); assert.match(M.FROM.en, /LENSIQ/); assert.match(M.FROM.zh, /LENSIQ/);
  assert.doesNotMatch(M.FROM.en + M.FROM.zh, THAI);
  for (const l of LANGS) {
    const m = P.cardModel(P.compose(pet("orange"), { lang: l }), { template: "rat" });
    assert.ok(m.from && m.from.includes(M.FROM[l]) && m.from.includes(P.LINK.replace(/^https:\/\//, "")), l + " footer: " + m.from);
  }
});

test("Z10 no price, buy or pay words or links near the card; draws are free and unlimited (no paid re-roll)", () => {
  const h = read("petread.html");
  const sec = h.match(/<section[^>]*id="petCardSec"[\s\S]*?<\/section>/);
  assert.ok(sec, "card section");
  const text = sec[0].replace(/<[^>]+>/g, " ");
  assert.doesNotMatch(text, MONEY, "money words in the card section");
  assert.doesNotMatch(sec[0], /<a\s[^>]*href/i, "no links in the card section");
  const dicts = ["en", "zh"].map(l => read(`i18n/${l}-petread.js`).split("\n").filter(x => /"pet\.(z|card|cardH|save|share)/.test(x)).join("\n")).join("\n");
  assert.doesNotMatch(dicts, MONEY, "money words in pet.z.* / card strings");
  for (const f of ["lensiq-pet-draw.js", "lensiq-pet-zodiac-art.js"]) {
    const s = read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(s, MONEY, f + " money words");
    assert.doesNotMatch(s, /LENSIQ_FORTUNE_PAID|LENSIQ_FORTUNE_PLAN|checkout|pricing\.html/i, f + " paid hooks");
  }
  const js = read("petread.js");
  const zs = [...js.matchAll(/T\(\s*"pet\.z[^"]*"\s*,\s*"([^"]*)"/g)].map(m => m[1]).join("\n");
  assert.doesNotMatch(zs, MONEY, "Thai pet.z.* strings");
  assert.doesNotMatch(js, /LENSIQ_FORTUNE_PAID|pricing\.html|checkout/i, "petread.js paid hooks");
  // a free draw-again button exists and nothing limits the number of draws
  assert.match(sec[0], /id="petZRedraw"/, "draw again button");
  assert.doesNotMatch(read("lensiq-pet-draw.js"), /max(?:Draws|PerDay)|limit|quota|cooldown/i, "no draw limit");
});

test("Z11 flags: LENSIQ_PET_ZODIAC default false, LENSIQ_PET_CARD_CLASSIC default false, odds preset b; classic themes kept", () => {
  const cfg = read("lensiq-config.js");
  assert.match(cfg, /window\.LENSIQ_PET_ZODIAC\s*=\s*window\.LENSIQ_PET_ZODIAC\s*===\s*true/);
  assert.match(cfg, /window\.LENSIQ_PET_CARD_CLASSIC\s*=\s*window\.LENSIQ_PET_CARD_CLASSIC\s*===\s*true/);
  assert.match(cfg, /PET_CARD_CLASSIC/);
  const W = { location: { pathname: "/petread.html", hostname: "example.org", search: "" } };
  try { vm.runInNewContext(cfg, { window: W, document: undefined, location: W.location, navigator: {}, console }); } catch (e) { /* DOM parts */ }
  assert.equal(W.LENSIQ_PET_ZODIAC, false, "zodiac mode off on the live site");
  assert.equal(W.LENSIQ_PET_CARD_CLASSIC, false, "classic flag default false (= zodiac draw mode when zodiac is on)");
  assert.equal(W.LENSIQ_PET_ZODIAC_ODDS, "b", "odds preset b (owner decision 137 ข)");
  const C = require("../../lensiq-pet-card.js");
  assert.deepEqual(Object.keys(C.THEMES).sort(), ["blossom", "mint", "night", "sunny"], "the 4 classic themes are kept");
  const h = read("petread.html");
  for (const t of ["sunny", "night", "mint", "blossom"]) assert.match(h, new RegExp(`data-theme="${t}"`), t + " button kept");
});

test("Z12 lazy: petread.html loads neither the draw module nor the template art; petread.js loads them only on demand", () => {
  const h = read("petread.html");
  assert.doesNotMatch(h, /<script[^>]*src="lensiq-pet-draw\.js/, "draw module not in the page head/body");
  assert.doesNotMatch(h, /<script[^>]*src="lensiq-pet-zodiac-art\.js/, "art not in the page");
  assert.doesNotMatch(h, /<link[^>]*(?:zodiac|pet-art)/i, "no preload of the art");
  const js = read("petread.js");
  assert.match(js, /lensiq-pet-draw\.js/); assert.match(js, /lensiq-pet-zodiac-art\.js/);
  assert.ok(exists("lensiq-pet-draw.js") && exists("lensiq-pet-zodiac-art.js"));
});

test("Z13 licence: the template art is recorded as original, LENSIQ", () => {
  const l = read("LICENSES/THIRD_PARTY.md");
  const row = l.split("\n").find(x => /lensiq-pet-zodiac-art\.js/.test(x));
  assert.ok(row, "a row for lensiq-pet-zodiac-art.js");
  assert.match(row, /original, LENSIQ/i);
});

test("Z14 the art module: 13 distinct styles (colours, border, stickers) and an illustration for each template", () => {
  const A = require("../../lensiq-pet-zodiac-art.js");
  assert.deepEqual(Object.keys(A.STYLES), ALL);
  const bgs = new Set(), borders = new Set();
  for (const id of ALL) {
    const s = A.STYLES[id];
    assert.ok(Array.isArray(s.bg) && s.bg.length >= 2 && s.ink && s.accent && s.border && Array.isArray(s.stickers) && s.stickers.length >= 2, id + " style");
    bgs.add(s.bg.join()); borders.add(s.border);
    assert.equal(typeof A.ANIMALS[id], "function", id + " illustration");
  }
  assert.equal(bgs.size, 13, "13 different colour schemes");
  assert.ok(borders.size >= 4, "several border styles");
  assert.ok(A.STYLES.secret.effect, "the secret card has its own effect");
  assert.equal(typeof A.drawCard, "function"); assert.equal(typeof A.drawSlot, "function");
  const s = read("lensiq-pet-zodiac-art.js");
  assert.doesNotMatch(s, /\.(?:png|jpe?g|webp|gif|svg)["'?]|https?:\/\/|drawImage\(\s*["']/i, "no third-party image files: our own paths only");
});

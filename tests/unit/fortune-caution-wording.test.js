"use strict";
// tests/unit/fortune-caution-wording.test.js — FIXED TEST SET fortune-caution, APPROVED-WORDING GATE (coordinator order 2026-11-20 after the
// independent review, round 2: "stop the probe arms race, change the control"). Locked BEFORE the code (relock7/).
// Primary control: every caution, encouragement, guidance and luck text that can ship is an entry of the register fortune-caution-wording.js
// ({ STATUS, ENTRIES: [{ id, cat, status, th, en, zh }] }); the rules (fortune-caution-rules-*.js) hold entry ids only; the pack tool puts an
// entry into a live pack only when its status is "reviewed" or "expert-ok", draft entries only into the draft packs
// (fortune-caution-pack-<domain>-<lang>-draft.js, loaded only with LENSIQ_FORTUNE_CAUTIONS_DRAFTS). tools/fortune-caution-pack.mjs exports
// packs() -> { <file>: <source> } (live and draft) and checkRules(rules, wording, { live }) -> problems[] (any text that is not a register
// entry, or below "reviewed" in a live pack). Health wording may name only broad areas (fixed list below; organs never); people wording
// only the fixed broad phrases below. The filter (fortune-caution-filter.js) stays as defence in depth and must pass every entry.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, readdirSync } = require("node:fs");
const { join } = require("node:path");
const vm = require("node:vm");

const ROOT = join(__dirname, "..", "..");
const LANGS = ["th", "en", "zh"];
const W = require(join(ROOT, "fortune-caution-wording.js"));
const core = require(join(ROOT, "fortune-caution-core.js"));
const BY = new Map(W.ENTRIES.map(e => [e.id, e]));
const RANK = { draft: 0, reviewed: 1, "expert-ok": 2 };
const FIELDS = ["mind", "do", "cheer", "luck"];
const RAW = ["fortune-caution-rules-th.js", "fortune-caution-rules-cn.js", "fortune-caution-rules-w.js"].flatMap(f => require(join(ROOT, f)).map(r => ({ r, f })));
const kindOf = cat => cat.split(":")[0];
const loadPack = file => { const w = {}; vm.runInNewContext(readFileSync(join(ROOT, file), "utf8"), { window: w }); return w.LQCautionRules || []; };

/* fixed broad phrases (locked) */
const PEOPLE_OK = {
  th: ["บ้านพักคนชรา", "คนที่ไว้ใจได้", "คนที่ไว้ใจ", "คนที่ลำบาก", "คนเดียว", "คนรอบตัว", "คนอื่น", "ทุกคน", "เลือกคน", "ผู้อื่น", "ผู้ใหญ่", "ผู้ที่ช่วยเหลือ",
    "ผู้อุปถัมภ์", "พ่อแม่", "คู่นี้", "เพื่อนร่วมทาง", "เพื่อน", "คนที่ไม่หวังดี", "คนแปลกหน้า", "คนใกล้ตัว", "ผู้สูงอายุ"],
  en: ["someone you trust", "people in need", "the right people", "people around you", "helpful people", "people see", "people over", "with others",
    "others miss", "friends", "your parents", "the elders", "a senior person", "those who help you", "this pair", "strangers", "people who wish you ill"],
  zh: ["每个人", "信任的人", "可信的人", "有需要的人", "一个人", "选对人", "朋友", "个人", "他人", "人脉", "身边的人", "人生", "替人", "人心", "别人", "这一对",
    "两人", "父母", "长辈", "帮助您的人", "贵人", "陌生人"],
};
const PERSON = {
  th: new RegExp(["คน|ผู้(?:ใหญ่|อื่น|ที่|อุปถัมภ์|คน|ชาย|หญิง)|เพื่อน|พ่อ|แม่|ญาติ|หัวหน้า|เจ้านาย|แฟน|ครู|พระ", "คู่(?:นี้|รัก|ครอง|ชีวิต)|สามี|ภรรยา|ลูก"].join("|")),
  en: new RegExp("\\b(?:" + ["people|person|someone|anyone|friends?|partners?|boss|colleagues?|seniors?|elders?|parents?|family|neighbou?rs?",
    "strangers?|others|those|pair|man|woman|men|women|he|she|him|her|husband|wife"].join("|") + ")\\b", "i"),
  zh: /人|朋友|长辈|父母|家人|伴侣|老板|同事|邻居|他|她|男友|女友|丈夫|妻子|一对/,
};
const BODY_OK = { th: ["ศีรษะ", "แขน", "ขา", "ท้อง", "หลัง", "ไหล่", "เข่า", "คอ"], en: ["head", "arms", "legs", "stomach", "back", "shoulders", "knees", "neck"],
  zh: ["头部", "手臂", "腿", "腹部", "背", "腰", "肩", "膝", "颈"] };
const ORGAN = /หัวใจ|ปอด|ตับ|ไต|กระเพาะ|ลำไส้|สมอง|มดลูก|ต่อม|เลือด|\b(?:heart|lungs?|liver|kidneys?|bowels?|intestin\w*|brain|uterus|blood|glands?)\b|心脏|肺|肝|肾|肠|脑|子宫|血|腺/i;

test("register: unique ids, a category, a status, all three languages", () => {
  assert.ok(Array.isArray(W.STATUS) && W.STATUS.join() === "draft,reviewed,expert-ok");
  assert.ok(W.ENTRIES.length >= 40, "entries " + W.ENTRIES.length);
  const seen = new Set();
  for (const e of W.ENTRIES) {
    assert.ok(typeof e.id === "string" && !seen.has(e.id), "id " + e.id); seen.add(e.id);
    assert.match(e.cat, /^(?:mind:[a-z]+|do:(?:mindful|precepts|merit|parents|religion)|cheer|luck)$/, e.id + ": cat " + e.cat);
    assert.ok(W.STATUS.includes(e.status), e.id + ": status");
    for (const l of LANGS) assert.ok(typeof e[l] === "string" && e[l].trim().length > 5, e.id + ": " + l);
  }
});

test("rules hold register ids only, of the matching kind; the rule files carry no free text", () => {
  let n = 0;
  for (const { r, f } of RAW) for (const k of FIELDS) {
    if (r[k] === undefined) continue;
    n++;
    assert.equal(typeof r[k], "string", f + " " + r.id + "." + k + ": an id, not text");
    const e = BY.get(r[k]);
    assert.ok(e, f + " " + r.id + "." + k + ": " + r[k] + " is not in the register");
    assert.equal(kindOf(e.cat), k, r.id + "." + k + ": entry kind " + e.cat);
    if (k === "do") assert.equal(e.cat, "do:" + r.doCat, r.id + ": guidance category");
  }
  assert.ok(n >= 60, "text references " + n);
  for (const f of ["fortune-caution-rules-th.js", "fortune-caution-rules-cn.js", "fortune-caution-rules-w.js"]) {
    const src = readFileSync(join(ROOT, f), "utf8");
    assert.doesNotMatch(src, /\b(?:mind|do|cheer|luck): T\(|\b(?:mind|do|cheer|luck): \{/, f + ": free text in a rule");
  }
  for (const r of core.rules()) for (const k of FIELDS) if (r[k]) for (const l of LANGS) {
    const raw = RAW.find(x => x.r.id === r.id).r;
    assert.equal(r[k][l], BY.get(raw[k])[l], r.id + "." + k + "." + l + ": resolved from the register");
  }
});

test("every shipped text is a register entry; live packs hold reviewed or expert-ok entries only, draft entries only in draft packs", () => {
  const files = readdirSync(ROOT).filter(f => /^fortune-caution-pack-.*\.js$/.test(f));
  const live = files.filter(f => !/-draft\.js$/.test(f)), draft = files.filter(f => /-draft\.js$/.test(f));
  assert.ok(live.length >= 15 && draft.length >= 15, "live " + live.length + ", draft " + draft.length);
  let texts = 0;
  for (const f of files) {
    const isDraft = /-draft\.js$/.test(f), lang = /-(th|en|zh)(?:-draft)?\.js$/.exec(f)[1];
    for (const r of loadPack(f)) {
      for (const k of FIELDS) {
        if (r[k] === undefined) continue;
        const keys = Object.keys(r[k]);
        assert.deepEqual(keys, [lang], f + " " + r.id + "." + k + ": one language");
        const hit = W.ENTRIES.filter(e => kindOf(e.cat) === k && e[lang] === r[k][lang]);
        assert.ok(hit.length, f + " " + r.id + "." + k + ": text not in the register: " + r[k][lang]);
        if (!isDraft) assert.ok(hit.every(e => RANK[e.status] >= 1), f + " " + r.id + "." + k + ": a draft entry in a live pack");
        texts++;
      }
      assert.equal(Object.keys(r).filter(k => /^(?:text|label|title|html|desc)/.test(k)).length, 0, f + " " + r.id + ": an extra text field");
    }
  }
  assert.ok(texts >= 60, "pack texts checked: " + texts);
});

test("the pack tool refuses any text outside the register and any draft entry in a live pack", async () => {
  const tool = await import(join(ROOT, "tools", "fortune-caution-pack.mjs"));
  assert.equal(typeof tool.checkRules, "function");
  const good = core.rules().slice(0, 3);
  const raw = RAW.slice(0, 3).map(x => x.r);
  assert.deepEqual(tool.checkRules(raw, W, { live: false }), [], "the register's own entries pass (draft pack)");
  const bad1 = [Object.assign({}, raw[0], { mind: "no.such.entry" })];
  assert.ok(tool.checkRules(bad1, W, { live: false }).length > 0, "an unknown id is refused");
  const bad2 = [Object.assign({}, raw[0], { mind: { th: "ระวังทุกอย่าง", en: "Be careful.", zh: "小心。" } })];
  assert.ok(tool.checkRules(bad2, W, { live: false }).length > 0, "free text is refused");
  const draftOnly = raw.filter(r => FIELDS.some(k => r[k] && BY.get(r[k]).status === "draft"));
  if (draftOnly.length) assert.ok(tool.checkRules(draftOnly, W, { live: true }).length > 0, "a draft entry is refused for a live pack");
  assert.ok(good.length === 3);
});

test("every register entry passes the section's filter in its own kind and in every place its rules can show it", () => {
  const where = new Map();
  for (const { r } of RAW) for (const k of FIELDS) if (r[k]) {
    const ctxs = r.kind === "period" ? r.spans.map(span => ({ part: "period", span })) : [{ part: "overall" }];
    where.set(r[k], (where.get(r[k]) || []).concat(ctxs));
  }
  for (const e of W.ENTRIES) for (const l of LANGS) for (const ctx of where.get(e.id) || [{ part: "overall" }]) {
    assert.equal(core.check(e[l], kindOf(e.cat), ctx), "", e.id + " " + l + " " + JSON.stringify(ctx) + ": " + e[l]);
  }
});

test("people only in the fixed broad phrases; health only broad body areas, never an organ", () => {
  const bad = [];
  for (const e of W.ENTRIES) for (const l of LANGS) {
    let t = e[l];
    for (const p of PEOPLE_OK[l].slice().sort((a, b) => b.length - a.length)) t = t.split(p).join(" ");
    if (l === "en") t = t.replace(/\bpeople\b(?= (?:see|over|around|in need|who wish))/gi, " ");
    if (PERSON[l].test(t)) bad.push(e.id + " " + l + " person: " + e[l]);
    if (ORGAN.test(e[l])) bad.push(e.id + " " + l + " organ: " + e[l]);
    if (/^mind:health$/.test(e.cat) && !BODY_OK[l].some(b => e[l].includes(b)) && !/สุขภาพ|health|健康/i.test(e[l])) bad.push(e.id + " " + l + " health without a broad area: " + e[l]);
  }
  assert.deepEqual(bad, []);
});

"use strict";
// tests/unit/planner-occasions.test.js — FIXED TEST SET "planner-occasions" (owner order 2026-11-18), locked BEFORE the build
// (evals-locks/planner-occasions.sha256, ~/LENSIQ-field/evals/planner-occasions/). planner.html gets more occasions in groups.
//   O1  every occasion the owner named is offered (family, home and land, business, vehicle and travel, work and study), in groups
//   O2  every occasion has >= 2 sources from different publishers in docs/planner-occasion-sources.json (title, publisher,
//       URL or book, date read) and a plain-words reason in TH / EN / ZH
//   O3  excluded occasions are absent in every language, synonyms included: caesarean / birth-date choosing / any medical
//       procedure; investing, shares, gold
//   O4  no promise wording: every new string passes the fortune safety filter (FortuneAI.safety.isSafe) and the belief-wording
//       lint (LQMeritLint: guarantee, fix-luck, fear, health, lottery, price, purchase, urgency), plus the planner's own word list
//   O5  the three original occasions (move, shop, work) give exactly the same results as before (regression snapshot made on
//       origin/main b2a6e76 before the build: tests/unit/fixtures/planner-regression-3.json)
//   O6  every new occasion lists good days only, by its recorded rule: favoured weekdays / lunar months / lunar days / owner's
//       birth weekday as recorded; kalakini and clash days silently left out; every reason has TH / EN / ZH text
// Crisis v3 on planner: the locked crisis-v3 sets (crisis-v3-*.e2e.mjs) keep running unchanged.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const HS = require("../../horoscope.js");
const P = require("../../lensiq-planner.js");
require("../../lensiq-planner-occ.js");
const FA = require("../../fortune-ai.js");
const ML = require("../../lensiq-merit-lint.js");

function dict(files, lang) {
  const q = [];
  const win = { LQI18N_Q: q };
  for (const f of files) new Function("window", read("i18n/" + f))(win);
  return Object.assign({}, ...q.map(x => x[lang] || {}));
}
const EN = dict(["en-planner.js", "en-planner-occ.js"], "en"), ZH = dict(["zh-planner.js", "zh-planner-occ.js"], "zh");
const HTML = read("planner.html");
const TH_HTML = {};
for (const m of HTML.matchAll(/data-i18n="(pl\.[\w.]+)"[^>]*>([^<]*)</g)) TH_HTML[m[1]] = m[2].trim();
const SRC = JSON.parse(read("docs/planner-occasion-sources.json"));

const OLD = ["move", "shop", "work"];
const WANT = {
  family: ["wedding", "engage", "ordain", "bdaymerit", "haircut"],
  home: ["move", "pillar", "pile", "spirit", "shrine"],
  biz: ["shop", "compreg", "newco", "contract", "branch"],
  travel: ["car", "journey"],
  study: ["work", "waikru", "launch"],
};
const NEW = () => P.EVENTS.filter(e => !OLD.includes(e));
const FROM = { y: 2026, m: 12, d: 1 }, TO = { y: 2027, m: 11, d: 30 };

test("O1 every occasion the owner named is offered, in its group, in the page and in the logic", () => {
  assert.ok(Array.isArray(P.GROUPS) && P.GROUPS.length >= 5, "groups");
  const byId = Object.fromEntries(P.GROUPS.map(g => [g.id, g.ev]));
  for (const [g, evs] of Object.entries(WANT)) {
    assert.ok(byId[g], "group " + g);
    for (const e of evs) {
      assert.ok(byId[g].includes(e), `${e} in group ${g}`);
      assert.ok(P.EVENTS.includes(e), e + " in EVENTS");
      assert.ok(new RegExp(`name="plEvent" value="${e}"`).test(HTML), e + ": radio in planner.html");
      assert.ok(TH_HTML["pl.ev." + e], e + ": Thai name in planner.html");
      assert.ok(EN["pl.ev." + e] && ZH["pl.ev." + e], e + ": EN / ZH name");
    }
    assert.ok(TH_HTML["pl.g." + g] && EN["pl.g." + g] && ZH["pl.g." + g], "group name TH / EN / ZH " + g);
  }
  // every occasion is in exactly one group; every group in the page
  const all = P.GROUPS.flatMap(g => g.ev);
  assert.deepEqual([...new Set(all)].sort(), [...P.EVENTS].sort());
  assert.equal(all.length, new Set(all).size, "an occasion in two groups");
  for (const g of P.GROUPS) assert.ok(new RegExp(`name="plGroup" value="${g.id}"`).test(HTML), "group control " + g.id);
});

test("O2 every occasion: >= 2 sources from different publishers (title, publisher, URL or book, date read) and a plain reason in TH / EN / ZH", () => {
  const rows = Object.fromEntries(SRC.occasions.map(o => [o.id, o]));
  for (const e of P.EVENTS) {
    const o = rows[e];
    assert.ok(o, e + ": no row in docs/planner-occasion-sources.json");
    assert.ok(Array.isArray(o.sources) && o.sources.length >= 2, e + ": fewer than 2 sources");
    for (const s of o.sources) {
      assert.ok(String(s.title || "").trim().length > 3, e + ": source title");
      assert.ok(String(s.publisher || "").trim().length > 1, e + ": source publisher");
      assert.ok(/^https:\/\/\S+$/.test(s.url || "") || String(s.book || "").trim().length > 3, e + ": URL or book");
      assert.match(String(s.read || ""), /^20\d\d-\d\d-\d\d$/, e + ": date read");
    }
    const pub = s => (s.url ? new URL(s.url).hostname.replace(/^www\./, "").split(".").slice(-3).join(".") : "") + "|" + String(s.publisher).toLowerCase();
    const hosts = new Set(o.sources.map(s => (s.url ? new URL(s.url).hostname.replace(/^(www|home|my)\./, "") : s.publisher.toLowerCase())));
    assert.ok(hosts.size >= 2, e + ": the sources are not independent (same site): " + [...o.sources.map(pub)].join(", "));
    assert.ok(String(o.rule_th || "").length > 10, e + ": rule summary");
    // plain-words reason, shown with the result
    assert.ok(P.WHY && String(P.WHY[e] || "").length > 20, e + ": TH plain reason (LQPlanner.WHY)");
    assert.ok(String(EN["pl.why." + e] || "").length > 20, e + ": EN plain reason");
    assert.ok(String(ZH["pl.why." + e] || "").length > 6, e + ": ZH plain reason");
  }
});

// synonyms of the excluded occasions, TH / EN / ZH
const EXCLUDED = new RegExp([
  "ผ่าคลอด", "คลอด", "ฤกษ์คลอด", "ฤกษ์เกิด", "ผ่าตัด", "ศัลยกรรม", "ทำศัลย", "เสริมจมูก", "ฉีด", "เลเซอร์", "รักษาตัว", "เข้าโรงพยาบาล", "ทำฟัน",
  "หุ้น", "ลงทุน", "ทองคำ", "ซื้อทอง", "ออมทอง", "เทรด", "คริปโต", "กองทุน", "เก็งกำไร",
  "caesarean", "cesarean", "c-section", "childbirth", "give birth", "delivery of a baby", "surgery", "surgical", "operation", "medical", "cosmetic", "hospital", "dental",
  "invest", "shares", "stock market", "stocks", "gold", "crypto", "mutual fund",
  "剖腹", "剖宫", "分娩", "生产日", "手术", "整形", "医美", "医院", "投资", "股票", "股份", "买金", "黄金", "炒股", "基金",
].join("|"), "i");

test("O3 excluded occasions are absent (names, groups, reasons, rules and the sources file, TH / EN / ZH, synonyms included)", () => {
  const texts = [];
  for (const g of P.GROUPS) texts.push(["group " + g.id, g.id], ["TH group", TH_HTML["pl.g." + g.id]], ["EN group", EN["pl.g." + g.id]], ["ZH group", ZH["pl.g." + g.id]]);
  for (const e of P.EVENTS) {
    texts.push(["id", e]);
    for (const k of ["pl.ev." + e, "pl.ev." + e + "S", "pl.why." + e]) texts.push(["TH " + k, TH_HTML[k] || ""], ["EN " + k, EN[k] || ""], ["ZH " + k, ZH[k] || ""]);
    texts.push(["TH why " + e, P.WHY[e]]);
  }
  for (const id of Object.keys(P.TH)) texts.push(["TH reason " + id, P.TH[id]], ["EN reason " + id, EN["pl.r." + id] || ""], ["ZH reason " + id, ZH["pl.r." + id] || ""]);
  for (const o of SRC.occasions) texts.push(["sources " + o.id, [o.id, o.th, o.en, o.rule_th].join(" ")]);
  for (const [where, t] of texts) assert.ok(!EXCLUDED.test(String(t || "")), `${where}: excluded occasion word "${(String(t).match(EXCLUDED) || [])[0]}" in: ${t}`);
  assert.ok(texts.length > 200, "strings checked " + texts.length);
  // the delivery of a new car is a vehicle hand-over, never a purchase or an investment
  assert.ok(!/ซื้อ|buy|purchase|购买|买/i.test([TH_HTML["pl.ev.car"], TH_HTML["pl.ev.carS"], EN["pl.ev.car"], EN["pl.ev.carS"], ZH["pl.ev.car"], ZH["pl.ev.carS"]].join(" ")), "car wording");
});

test("O4 no promise wording: fortune safety filter + belief-wording lint + planner word list on every occasion string, TH / EN / ZH", () => {
  const vars = { d: 5, m: 12, n: 1, birth: "x", day: "y", animal: "z", dayAnimal: "w", bhumi: "b", event: "e", ld: 4 };
  const fillV = s => String(s).replace(/\{(\w+)\}/g, (_, k) => vars[k] != null ? vars[k] : k);
  const LINT = ["guarantee", "fix_luck", "fear", "health", "lottery", "price", "purchase", "urgency"];
  const BAD_TH = /ตาย|เจ็บ|ป่วย|โรค|อุบัติเหตุ|ภัย|หายนะ|นอกใจ|หวย|ลอตเตอรี่|เลขเด็ด|แก้กรรม|สะเดาะเคราะห์|ซวย|อัปมงคล|ห้าม|รับประกัน|แน่นอน|รับรองว่า|ต้องได้|จะได้รับ|ร่ำรวยแน่|ไม่เช่นนั้น|มิฉะนั้น/;
  const BAD_EN = /\b(death|ill|illness|accident|disaster|infidel\w*|lottery|unlucky|bad luck|remedy|guarantee\w*|certain(ly)?|will (bring|make|give|ensure)|ensures?|otherwise|or else)\b/i;
  const BAD_ZH = /死|病|灾|事故|出轨|彩票|凶|忌|保证|一定会|必定|必然|否则/;
  const strings = [];
  for (const e of NEW()) {
    strings.push(["TH why " + e, P.WHY[e]], ["EN why " + e, EN["pl.why." + e]], ["ZH why " + e, ZH["pl.why." + e]]);
    for (const k of ["pl.ev." + e, "pl.ev." + e + "S"]) strings.push(["TH " + k, TH_HTML[k]], ["EN " + k, EN[k]], ["ZH " + k, ZH[k]]);
  }
  for (const e of OLD) strings.push(["TH why " + e, P.WHY[e]], ["EN why " + e, EN["pl.why." + e]], ["ZH why " + e, ZH["pl.why." + e]]);
  for (const g of P.GROUPS) strings.push(["TH g", TH_HTML["pl.g." + g.id]], ["EN g", EN["pl.g." + g.id]], ["ZH g", ZH["pl.g." + g.id]]);
  for (const id of Object.keys(P.TH)) strings.push(["TH r " + id, P.TH[id]], ["EN r " + id, EN["pl.r." + id]], ["ZH r " + id, ZH["pl.r." + id]]);
  for (const [k, v] of Object.entries(dict(["en-planner-occ.js"], "en"))) strings.push(["EN occ " + k, v]);
  for (const [k, v] of Object.entries(dict(["zh-planner-occ.js"], "zh"))) strings.push(["ZH occ " + k, v]);
  for (const [where, raw] of strings) {
    assert.ok(raw && String(raw).trim(), where + ": missing");
    const s = fillV(raw);
    assert.ok(FA.safety.isSafe(s), where + " fails the fortune safety filter: " + s);
    const hits = ML.lintMerit(s, { only: LINT });
    assert.deepEqual(hits, [], where + ": " + JSON.stringify(hits) + " in " + s);
    assert.ok(!BAD_TH.test(s) && !BAD_EN.test(s) && !BAD_ZH.test(s), where + ": " + s);
  }
  assert.ok(strings.length > 250, "strings checked " + strings.length);
});

test("O5 move / shop / work: results identical to the snapshot taken before the build", () => {
  const snap = JSON.parse(read("tests/unit/fixtures/planner-regression-3.json"));
  assert.equal(snap.cases.length, 114);
  for (const c of snap.cases) {
    const days = P.plan({ event: c.event, from: c.from, to: c.to, owners: c.owners });
    const sha = crypto.createHash("sha256").update(JSON.stringify(days)).digest("hex");
    if (c.days) assert.deepEqual(days, c.days, JSON.stringify([c.event, c.from, c.owners]));
    assert.equal(days.length, c.n, "count " + JSON.stringify([c.event, c.from, c.owners]));
    assert.equal(sha, c.sha256, "days changed " + JSON.stringify([c.event, c.from, c.owners]));
    assert.equal(P.maxScore({ event: c.event, owners: c.owners }), c.max, "max " + c.event);
  }
  for (const [k, v] of Object.entries(snap.TH)) assert.equal(P.TH[k], v, "Thai reason changed: " + k);
});

test("O6 every new occasion: good days only, by its recorded rule; kalakini / clash left out; reasons in TH / EN / ZH", () => {
  for (const e of NEW()) {
    const R = P.OCC[e];
    assert.ok(R, e + ": rule (LQPlanner.OCC)");
    const plain = P.plan({ event: e, from: FROM, to: TO });
    if (R.needsOwner) assert.equal(plain.length, 0, e + ": needs the owner's birth weekday, lists nothing without it");
    else assert.ok(plain.length >= 6, e + ": too few days in 12 months without owners: " + plain.length);
    for (let planet = 0; planet <= 7; planet++) {
      const owners = [{ planet, animal: (planet * 7 + 2) % 12 }];
      const days = P.plan({ event: e, from: FROM, to: TO, owners });
      // re-lock 1 (before any measurement of the build): a rule with ONE recorded weekday (waikru: Thursday only, the music texts say
      // "ต้องทำในวันพฤหัสบดีเท่านั้น") that is the owner's kalakini day lists nothing (good days only, never a warning); else some days
      if (R.days && R.days.length === 1 && HS.bhumiOf(planet, R.days[0]) === "kalakini") assert.equal(days.length, 0, `${e}/${planet}: the only weekday is kalakini`);
      else assert.ok(days.length > 0, `${e}/${planet}: some days`);
      for (const x of days.concat(planet === 0 ? plain : [])) {
        const L = P.lunarDay(x.y, x.m, x.d);
        if (R.days && R.days.length) assert.ok(R.days.includes(x.wd), `${e}: weekday ${x.wd} not in the recorded rule`);
        if (R.monthsRequired) assert.ok(R.months.includes(L.month), `${e}: lunar month ${L.month} not in the recorded rule`);
        if (R.lunarDays) assert.ok(R.lunarDays.includes(L.day), `${e}: lunar day ${L.day} not in the recorded rule`);
        if (R.monthBan) assert.ok(!(R.monthBan[L.month] || []).includes(x.wd), `${e}: weekday ${x.wd} listed in lunar month ${L.month}`);
        if (R.needsOwner) assert.equal(x.wd, owners[0].planet === 7 ? 3 : owners[0].planet, e + ": not the owner's birth weekday");
        if (R.byBirth && days.includes(x)) assert.ok(R.byBirth[owners[0].planet].includes(x.wd), `${e}: ${x.wd} not in the table for ${planet}`);
        if (days.includes(x)) {
          assert.notEqual(HS.bhumiOf(planet, x.wd), "kalakini", e + ": kalakini day listed");
          assert.notEqual(HS.branchRel(owners[0].animal, HS.dayPillarJDN(HS.jdn(x.y, x.m, x.d)).branch), "clash", e + ": clash day listed");
        }
        assert.ok(x.score > 0 && x.score <= P.maxScore({ event: e, owners: days.includes(x) ? owners : [] }), e + ": score");
        assert.ok(x.reasons.length > 0, e + ": no reason");
        for (const r of x.reasons) {
          assert.ok(r.id in P.TH, e + ": TH text for reason " + r.id);
          assert.ok(EN["pl.r." + r.id] && ZH["pl.r." + r.id], e + ": EN / ZH text for reason " + r.id);
        }
      }
    }
    assert.ok(!/bad|kalakini|clash|warn|avoid/i.test(JSON.stringify(plain)), e + ": a bad-day field in the output");
  }
});

test("O6b the occasion data is not loaded before a user action (speed budget): page HTML references no occasion pack", () => {
  assert.ok(!/<script[^>]+lensiq-planner-occ\.js/.test(HTML), "lensiq-planner-occ.js must be loaded on demand, not by a <script> tag");
  assert.ok(!/<script[^>]+i18n\/(?:zh|en)-planner-occ\.js/.test(HTML), "the occasion dictionaries must be loaded on demand");
});

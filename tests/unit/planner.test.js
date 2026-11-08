"use strict";
// Auspicious-date planner (planner.html, round 14 / S2-E2): lunar day vs announced Buddhist holidays, good-days-only
// rules (no kalakini / clash day listed, never a warning), fortune hard bans on every reason in TH/EN/ZH, iCalendar
// output (CRLF, 75-octet folding, all-day + timed), EN/ZH dictionary parity, and no storage / network in the page code.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.join(__dirname, "..", "..");
const HS = require("../../horoscope.js");
const P = require("../../lensiq-planner.js");
const FA = require("../../fortune-ai.js");

function dict(file, lang) {
  const q = [];
  const win = { LQI18N_Q: q };
  new Function("window", fs.readFileSync(path.join(ROOT, "i18n", file), "utf8"))(win);
  return Object.assign({}, ...q.map(x => x[lang]));
}
const EN = dict("en-planner.js", "en"), ZH = dict("zh-planner.js", "zh");

test("lunar day: announced Buddhist holidays 2025–2026 are ขึ้น 15 ค่ำ of the right lunar month", () => {
  const cases = [
    [2026, 3, 3, 4, false],   // มาฆบูชา 2569 (ปีอธิกมาส → เดือน 4)
    [2026, 5, 31, 7, false],  // วิสาขบูชา 2569 (เดือน 7 ในปีอธิกมาส)
    [2026, 7, 29, 8, true],   // อาสาฬหบูชา 2569 (เดือน 8 หลัง)
    [2026, 11, 24, 12, false],// ลอยกระทง 2569
    [2025, 2, 12, 3, false],  // มาฆบูชา 2568
    [2025, 11, 5, 12, false], // ลอยกระทง 2568
  ];
  for (const [y, m, d, month, leap] of cases) {
    const L = P.lunarDay(y, m, d);
    assert.equal(L.waxing, true, `${y}-${m}-${d} waxing`);
    assert.equal(L.day, 15, `${y}-${m}-${d} day ${L.day}`);
    assert.equal(L.month, month, `${y}-${m}-${d} month ${L.month}`);
    assert.equal(L.leap, leap, `${y}-${m}-${d} leap`);
    assert.equal(L.phra, true);
    assert.equal(L.approx, true);
  }
});

test("lunar day: other announced holidays are within ±1 day (the page says approximate)", () => {
  for (const [y, m, d] of [[2025, 5, 11], [2024, 5, 22], [2024, 7, 20], [2023, 3, 6], [2023, 6, 3], [2024, 11, 15]]) {
    const near = [-1, 0, 1].some(o => { const t = HS.fromJD(HS.jdn(y, m, d) + o); const L = P.lunarDay(t.y, t.m, t.d); return L.waxing && L.day === 15; });
    assert.ok(near, `${y}-${m}-${d}`);
  }
});

test("lunar day: a month runs ขึ้น 1..15 then แรม 1..14/15 with no gaps", () => {
  let prev = null, seen = 0;
  for (let j = HS.jdn(2026, 1, 1); j <= HS.jdn(2027, 12, 31); j++) {
    const t = HS.fromJD(j), L = P.lunarDay(t.y, t.m, t.d);
    assert.ok(L.day >= 1 && L.day <= 15, JSON.stringify([t, L]));
    if (prev) {
      if (prev.waxing && L.waxing) assert.equal(L.day, prev.day + 1);
      else if (prev.waxing && !L.waxing) { assert.equal(prev.day, 15); assert.equal(L.day, 1); }
      else if (!prev.waxing && !L.waxing) assert.equal(L.day, prev.day + 1);
      else { assert.ok(prev.day === 14 || prev.day === 15, "month ends on แรม 14/15: " + prev.day); assert.equal(L.day, 1); assert.ok(prev.phra, "last waning day is วันพระ"); seen++; }
    }
    prev = L;
  }
  assert.ok(seen >= 23, "lunations seen " + seen);
});

test("plan: good days only — score ≥ minimum, kalakini and clash days are silently left out", () => {
  const from = { y: 2026, m: 12, d: 1 }, to = { y: 2027, m: 2, d: 28 };
  for (const event of P.EVENTS) {
    for (let planet = 0; planet <= 7; planet++) {
      const owners = [{ planet, animal: (planet * 5) % 12 }];
      const days = P.plan({ event, from, to, owners });
      assert.ok(days.length > 0, `${event}/${planet}: some days`);
      for (const x of days) {
        assert.ok(x.score >= P.MIN_SCORE, "score");
        assert.notEqual(HS.bhumiOf(planet, x.wd), "kalakini", "kalakini day listed");
        assert.notEqual(HS.branchRel(owners[0].animal, HS.dayPillarJDN(HS.jdn(x.y, x.m, x.d)).branch), "clash", "clash day listed");
        assert.ok(x.reasons.length > 0 && x.reasons.every(r => r.id in P.TH), "reasons have Thai text");
        assert.ok(x.score <= P.maxScore({ event, owners }), "score within max");
        assert.ok(x.colour.day === x.wd && x.colour.lucky === HS.taksa(x.wd).sri);
      }
    }
  }
  // no owners: waxing + a popular weekday is the minimum
  const plain = P.plan({ event: "shop", from, to });
  assert.ok(plain.length > 5 && plain.every(x => x.lunar.waxing && P.EVENT_DAYS.shop.includes(x.wd)));
  // no field for "bad" anything in the output
  assert.ok(!/bad|kalakini|clash|warn|avoid/i.test(JSON.stringify(plain)));
});

test("fortune hard bans: every reason / basis string in TH, EN and ZH passes the fortune safety filter", () => {
  const vars = { d: 5, m: 12, n: 1, birth: "x", day: "y", animal: "z", dayAnimal: "w", bhumi: "b", event: "e" };
  const fillV = s => String(s).replace(/\{(\w+)\}/g, (_, k) => vars[k]);
  const ids = Object.keys(P.TH);
  for (const id of ids) {
    assert.ok(FA.safety.isSafe(fillV(P.TH[id])), "TH " + id + ": " + P.TH[id]);
    assert.ok(EN["pl.r." + id], "EN missing pl.r." + id);
    assert.ok(ZH["pl.r." + id], "ZH missing pl.r." + id);
    assert.ok(FA.safety.isSafe(fillV(EN["pl.r." + id])), "EN " + id);
    assert.ok(FA.safety.isSafe(fillV(ZH["pl.r." + id])), "ZH " + id);
  }
  // the rest of the page wording too, except the disclaimer / principle lines that name what is excluded on purpose
  // ("not a guarantee", "no lucky numbers / no paid remedies") and therefore trip the certainty / gambling patterns
  const PRINCIPLE = new Set(["pl.b.only", "pl.disc.b", "pl.ics.disc"]);
  for (const [k, v] of Object.entries(EN)) if (!PRINCIPLE.has(k)) assert.ok(FA.safety.isSafe(fillV(v)), "EN " + k + ": " + v);
  for (const [k, v] of Object.entries(ZH)) if (!PRINCIPLE.has(k)) assert.ok(FA.safety.isSafe(fillV(v)), "ZH " + k + ": " + v);
  // explicit word list: no death / illness / accident / disaster / infidelity / lottery / paid remedy in any reason
  const BAD_TH = /ตาย|เจ็บ|ป่วย|โรค|อุบัติเหตุ|ภัย|หายนะ|นอกใจ|หวย|ลอตเตอรี่|เลขเด็ด|แก้กรรม|สะเดาะเคราะห์|ซวย|อัปมงคล|ห้าม/;
  const BAD_EN = /\b(death|ill|illness|accident|disaster|infidel\w*|lottery|unlucky|bad luck|remedy)\b/i, BAD_ZH = /死|病|灾|事故|出轨|彩票|凶|忌/;
  const BAD = { test: s => BAD_TH.test(s) || BAD_EN.test(s) || BAD_ZH.test(s) };
  for (const id of ids) for (const s of [P.TH[id], EN["pl.r." + id], ZH["pl.r." + id]]) assert.ok(!BAD.test(s), id + ": " + s);
});

test("i18n: EN and ZH have the same keys, cover every key used by the page, and contain no Thai", () => {
  assert.deepEqual(Object.keys(EN).sort(), Object.keys(ZH).sort());
  const html = fs.readFileSync(path.join(ROOT, "planner.html"), "utf8"), js = fs.readFileSync(path.join(ROOT, "planner.js"), "utf8");
  const used = new Set([...html.matchAll(/data-i18n="(pl\.[^"]+)"/g)].map(m => m[1]).concat([...html.matchAll(/:(pl\.[\w.]+)"/g)].map(m => m[1]),
    [...js.matchAll(/T\("(pl\.[\w.]+)"/g)].map(m => m[1]).filter(k => !k.endsWith("."))));
  for (const k of used) { assert.ok(k in EN, "EN missing " + k); assert.ok(k in ZH, "ZH missing " + k); }
  for (const p of [0, 1, 2, 3, 4, 5, 6, 7]) assert.ok(EN["pl.wd." + p] && EN["pl.col." + p] && ZH["pl.wd." + p] && ZH["pl.col." + p]);
  for (let a = 0; a < 12; a++) assert.ok(EN["pl.an." + a] && ZH["pl.an." + a]);
  for (let m = 1; m <= 12; m++) assert.ok(EN["pl.mon." + m] && ZH["pl.mon." + m]);
  for (const b of ["sri", "dech", "montri", "mula", "ayu", "boriwan", "utsaha"]) assert.ok(EN["pl.bh." + b] && ZH["pl.bh." + b]);
  const TH_RE = /[฀-๿]/;
  for (const [k, v] of Object.entries(EN)) assert.ok(!TH_RE.test(v), "Thai in EN " + k);
  for (const [k, v] of Object.entries(ZH)) assert.ok(!TH_RE.test(v), "Thai in ZH " + k);
});

test("ics: RFC 5545 all-day and timed events, CRLF, folding at 75 octets, escaping", () => {
  const long = "ฤกษ์ขึ้นบ้านใหม่, วันพฤหัสบดี; ".repeat(6);
  const txt = P.ics([{ y: 2026, m: 12, d: 31, title: long, desc: "a\nb" }], { stamp: new Date(Date.UTC(2026, 10, 8, 1, 2, 3)) });
  assert.ok(txt.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n") && txt.endsWith("END:VCALENDAR\r\n"));
  assert.ok(!/[^\r]\n/.test(txt), "bare LF");
  for (const line of txt.split("\r\n")) assert.ok(Buffer.byteLength(line, "utf8") <= 75, "line > 75 octets: " + line);
  const unfolded = txt.replace(/\r\n /g, "");
  assert.match(unfolded, /DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101/);
  assert.match(unfolded, /DTSTAMP:20261108T010203Z/);
  assert.match(unfolded, /SUMMARY:ฤกษ์ขึ้นบ้านใหม่\\, วันพฤหัสบดี\\; /);
  assert.match(unfolded, /DESCRIPTION:a\\nb/);
  assert.equal((unfolded.match(/BEGIN:VEVENT/g) || []).length, 1);
  // 09:30 Bangkok (UTC+7) = 02:30 UTC, one hour long
  const t = P.ics([{ y: 2027, m: 1, d: 1, title: "x" }], { time: "09:30" }).replace(/\r\n /g, "");
  assert.match(t, /DTSTART:20270101T023000Z\r\nDTEND:20270101T033000Z/);
  // 05:00 Bangkok on 1 Jan = 22:00 UTC on 31 Dec
  assert.match(P.ics([{ y: 2027, m: 1, d: 1, title: "x" }], { time: "05:00" }), /DTSTART:20261231T220000Z/);
});

test("privacy: planner code stores nothing and makes no network request", () => {
  for (const f of ["planner.js", "lensiq-planner.js"]) {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.ok(!/localStorage|sessionStorage|indexedDB|fetch\(|XMLHttpRequest|sendBeacon|WebSocket|navigator\.share/.test(src), f);
  }
});

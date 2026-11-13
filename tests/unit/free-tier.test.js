"use strict";
// tests/unit/free-tier.test.js — stream G (owner decisions 2026-11-13, free tiers option B). Locked BEFORE
// lensiq-freetier.js, backend/src/freetier.js and the site copy change were written.
//   Fortune and the general tools stay free (signed-out users keep the full fortune reading). Gate: 30-day trial, 1 lane,
//   100 plates per day. Attendance: up to 5 people. Exam: up to 5 candidates per session. Crowd: 2 hours per device per
//   day. The limits are COUNTED, NOT ENFORCED (enforcement flag off); they are announced at least 30 days ahead and start
//   30 days after the announcement; export is always available; a licence works offline for 14 days.
//
//   F1 backend constants = the approved numbers; enforcement off
//   F2 the device module carries the same numbers (one source of truth checked here)
//   F3 counting on the device: per Bangkok day, levels, trial days; over the limit is reported but never blocks
//   F4 announcement rule: start >= announcement + 30 days
//   F5 offline licence window: at most 14 days after the last check and never past the licence end
//   F6 site copy: "free, every feature" is gone; the free tiers + the 30-day notice are stated in TH / EN / ZH on
//      pricing.html, index.html and the four product pages
//   F7 claim checks pass, and the new rule really fails on "free, every feature" wording (fixture copy)
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const APPROVED = {
  gate: { trial_days: 30, lanes: 1, plates_per_day: 100 },
  attendance: { people: 5 },
  exam: { candidates_per_session: 5 },
  crowd: { hours_per_device_per_day: 2 }
};
const DAY = 86400 * 1000;
// amendment A-G2 (2026-11-13, before any run passed): arrays made inside the vm context have another realm's prototype, so
// strict deepEqual against [] always failed; the "over" lists are copied with Array.from (same values compared).

function loadClient() {
  const w = { console };
  w.window = w;
  vm.runInNewContext(read("lensiq-freetier.js"), w, { filename: "lensiq-freetier.js" });
  assert.ok(w.LQFreeTier, "window.LQFreeTier");
  return w.LQFreeTier;
}
const memStore = () => { const m = new Map(); return { get: k => (m.has(k) ? JSON.parse(m.get(k)) : null), set: (k, v) => { if (v == null) m.delete(k); else m.set(k, JSON.stringify(v)); }, m }; };
/** data-i18n Thai text of an element in a page */
function thaiOf(html, key) {
  const re = new RegExp(`<([a-z0-9]+)[^>]*\\sdata-i18n="${key.replace(/\./g, "\\.")}"[^>]*>([\\s\\S]*?)</\\1>`, "g");
  const out = []; let m;
  while ((m = re.exec(html))) out.push(m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
  return out;
}
function dict(file) {
  const w = {}; w.window = w;
  vm.runInNewContext(read(file), w, { filename: file });
  const q = w.LQI18N_Q || [];
  return Object.assign({}, ...q.map(x => x.en || x.zh || {}));
}

/* ---------------- F1 ---------------- */
test("F1: backend free tiers are the approved numbers; enforcement is off; notice 30 days, start 30 days after, offline 14 days", async () => {
  const F = await import(path.join(ROOT, "backend", "src", "freetier.js"));
  assert.deepEqual(F.FREE_TIERS, APPROVED);
  assert.equal(F.FREE_TIER_ENFORCE, false);
  assert.equal(F.NOTICE_DAYS, 30);
  assert.equal(F.START_AFTER_DAYS, 30);
  assert.equal(F.OFFLINE_LICENCE_DAYS, 14);
  assert.ok(Object.isFrozen(F.FREE_TIERS) && Object.isFrozen(F.FREE_TIERS.gate), "constants cannot be changed at run time");
  assert.deepEqual(Object.keys(F.FREE_TIERS).sort(), ["attendance", "crowd", "exam", "gate"], "Fortune and the general tools have no limit");
});

/* ---------------- F2 ---------------- */
test("F2: the device module carries the same numbers and the same enforcement flag", async () => {
  const F = await import(path.join(ROOT, "backend", "src", "freetier.js"));
  const C = loadClient();
  assert.deepEqual(JSON.parse(JSON.stringify(C.FREE_TIERS)), JSON.parse(JSON.stringify(F.FREE_TIERS)));
  assert.equal(C.ENFORCE, false);
  assert.equal(C.NOTICE_DAYS, 30); assert.equal(C.START_AFTER_DAYS, 30); assert.equal(C.OFFLINE_LICENCE_DAYS, 14);
});

/* ---------------- F3 ---------------- */
test("F3: counting on the device (Bangkok day, levels, trial days); over the limit is reported but never blocks", () => {
  const C = loadClient();
  const s = memStore();
  const t0 = Date.parse("2026-11-13T10:00:00+07:00");
  for (let i = 0; i < 100; i++) C.add(s, "gate", "plates", 1, t0);
  let st = C.status(s, "gate", t0);
  assert.equal(st.usage.plates, 100);
  assert.deepEqual(Array.from(st.over), []);
  assert.equal(st.allowed, true); assert.equal(st.enforced, false);
  C.add(s, "gate", "plates", 1, t0);
  st = C.status(s, "gate", t0);
  assert.deepEqual(Array.from(st.over), ["plates_per_day"]);
  assert.equal(st.allowed, true, "counting only: never blocks while enforcement is off");
  // a new Bangkok day starts at 00:00 +07:00 (17:00 UTC)
  assert.equal(C.status(s, "gate", Date.parse("2026-11-13T23:59:00+07:00")).usage.plates, 101);
  assert.equal(C.status(s, "gate", Date.parse("2026-11-14T00:01:00+07:00")).usage.plates, 0);
  // lanes are a level, not a daily count
  C.setLevel(s, "gate", "lanes", 2, t0);
  assert.ok(C.status(s, "gate", t0 + 3 * DAY).over.includes("lanes"));
  // trial days from the first use
  C.firstUse(s, "gate", t0);
  C.firstUse(s, "gate", t0 + 5 * DAY);
  assert.equal(C.status(s, "gate", t0 + 29 * DAY).usage.trial_days, 30);
  assert.ok(C.status(s, "gate", t0 + 30 * DAY).over.includes("trial_days"));
  // attendance people, exam candidates, crowd hours
  C.setLevel(s, "attendance", "people", 5, t0);
  assert.deepEqual(Array.from(C.status(s, "attendance", t0).over), []);
  C.setLevel(s, "attendance", "people", 6, t0);
  assert.deepEqual(Array.from(C.status(s, "attendance", t0).over), ["people"]);
  C.setLevel(s, "exam", "candidates_per_session", 5, t0);
  assert.deepEqual(Array.from(C.status(s, "exam", t0).over), []);
  C.add(s, "crowd", "seconds", 2 * 3600, t0);
  assert.deepEqual(Array.from(C.status(s, "crowd", t0).over), []);
  C.add(s, "crowd", "seconds", 1, t0);
  assert.deepEqual(Array.from(C.status(s, "crowd", t0).over), ["hours_per_device_per_day"]);
  assert.equal(C.status(s, "crowd", t0).allowed, true);
  // bad input is ignored, never throws
  C.add(s, "gate", "plates", -5, t0); C.add(s, "gate", "plates", NaN, t0); C.add(s, "nope", "x", 1, t0);
  assert.equal(C.status(s, "gate", t0).usage.plates, 101);
  assert.equal(C.status(s, "fortune", t0), null, "no limit for Fortune");
  // a store that throws (private mode) never breaks the page
  const broken = { get() { throw new Error("blocked"); }, set() { throw new Error("blocked"); } };
  assert.doesNotThrow(() => C.add(broken, "gate", "plates", 1, t0));
  assert.equal(C.status(broken, "gate", t0).allowed, true);
  // only numbers are kept on the device: no plate, name or person data in the counter values
  for (const v of s.m.values()) assert.ok(!/[ก-๙]|[A-Za-z]{3,}\s/.test(v.replace(/"(day|plates|lanes|trial_start|people|candidates_per_session|seconds|v)"/g, "")), v);
});

/* ---------------- F4 ---------------- */
test("F4: limits start 30 days after an announcement made at least 30 days ahead", async () => {
  const F = await import(path.join(ROOT, "backend", "src", "freetier.js"));
  const C = loadClient();
  const a = Date.parse("2026-12-01T00:00:00+07:00");
  assert.equal(C.limitsStart(a), a + 30 * DAY);
  assert.equal(F.limitsStart(a / 1000), a / 1000 + 30 * 86400, "backend works in unix seconds");
  assert.equal(C.announcementOk(a, a + 30 * DAY), true);
  assert.equal(C.announcementOk(a, a + 29 * DAY), false);
  assert.equal(F.announcementOk(a / 1000, a / 1000 + 29 * 86400), false);
});

/* ---------------- F5 ---------------- */
test("F5: an offline licence is valid at most 14 days after the last check and never past the licence end", async () => {
  const F = await import(path.join(ROOT, "backend", "src", "freetier.js"));
  const C = loadClient();
  const t = 1_800_000_000;
  assert.equal(F.offlineUntil(t, t + 100 * 86400), t + 14 * 86400);
  assert.equal(F.offlineUntil(t, t + 3 * 86400), t + 3 * 86400);
  const cache = { checked_at: t, offline_until: t + 14 * 86400 };
  assert.equal(C.offlineValid(cache, (t + 13 * 86400) * 1000), true);
  assert.equal(C.offlineValid(cache, (t + 14 * 86400 + 1) * 1000), false);
  assert.equal(C.offlineValid({ checked_at: t, offline_until: t + 40 * 86400 }, (t + 20 * 86400) * 1000), false, "a forged longer window is capped at 14 days");
  assert.equal(C.offlineValid(null, t * 1000), false);
});

/* ---------------- F6 ---------------- */
test("F6: site copy: no 'free, every feature'; free tiers + the 30-day notice stated in TH / EN / ZH on pricing, home and product pages", () => {
  const BANNED = [/ฟรีทุกฟีเจอร์/, /ทุกฟีเจอร์ฟรี/, /\bevery feature\b/i, /所有功能免费/];
  const files = ["pricing.html", "index.html", "gate.html", "attendance.html", "exam.html", "crowd.html", "help.html",
    "i18n/en-pricing.js", "i18n/zh-pricing.js", "i18n/en-common.js", "i18n/zh-common.js", "i18n/en-gate.js", "i18n/zh-gate.js",
    "i18n/en-attendance.js", "i18n/zh-attendance.js", "i18n/en-exam.js", "i18n/zh-exam.js", "i18n/en-crowd.js", "i18n/zh-crowd.js", "i18n/en-account.js", "i18n/zh-account.js"];
  for (const f of files) for (const re of BANNED) assert.ok(!re.test(read(f)), `${f}: ${re}`);
  // pricing summary of the free tiers
  const tok = {
    th: ["ดูดวง", "ไม่ต้องเข้าสู่ระบบ", "30 วัน", "100 ป้าย", "5 คน", "5 ผู้สอบ", "2 ชั่วโมง"],
    en: ["Fortune", "without signing in", "30-day", "100 plates", "5 people", "5 candidates", "2 hours"],
    zh: ["算命", "无需登录", "30 天", "100 个车牌", "5 人", "5 名考生", "2 小时"]
  };
  const pr = thaiOf(read("pricing.html"), "pr.free");
  assert.equal(pr.length, 1, "pricing.html pr.free");
  for (const w of tok.th) assert.ok(pr[0].includes(w), "pricing TH: " + w + " in " + pr[0]);
  const prEn = dict("i18n/en-pricing.js")["pr.free"], prZh = dict("i18n/zh-pricing.js")["pr.free"];
  for (const w of tok.en) assert.ok(prEn.includes(w), "pricing EN: " + w + " in " + prEn);
  for (const w of tok.zh) assert.ok(prZh.includes(w), "pricing ZH: " + w + " in " + prZh);
  // the notice (common dictionary) on pricing, home and the four product pages
  const en = dict("i18n/en-common.js"), zh = dict("i18n/zh-common.js");
  const notice = { th: ["ยังไม่บังคับใช้", "ล่วงหน้าอย่างน้อย 30 วัน", "30 วันหลัง", "ส่งออกข้อมูล"], en: ["not enforced yet", "at least 30 days", "30 days after", "export"], zh: ["尚未执行", "至少提前 30 天", "公告 30 天后", "导出"] };
  for (const w of notice.en) assert.ok((en["ft.notice"] || "").includes(w), "EN notice: " + w);
  for (const w of notice.zh) assert.ok((zh["ft.notice"] || "").includes(w), "ZH notice: " + w);
  for (const page of ["pricing.html", "index.html", "gate.html", "attendance.html", "exam.html", "crowd.html"]) {
    const th = thaiOf(read(page), "ft.notice");
    assert.ok(th.length >= 1, page + ": ft.notice");
    for (const w of notice.th) assert.ok(th[0].includes(w), page + " TH notice: " + w);
  }
  // per product (each page's own dictionary + the Thai markup)
  const per = [
    ["gate.html", "gate", "ft.gate", ["30 วัน", "1 ช่องทาง", "100"], ["30-day", "1 lane", "100"], ["30 天", "1 条车道", "100"]],
    ["attendance.html", "attendance", "ft.attendance", ["5 คน"], ["5 people"], ["5 人"]],
    ["exam.html", "exam", "ft.exam", ["5 ผู้สอบ", "ต่อรอบ"], ["5 candidates", "per session"], ["5 名考生", "每场"]],
    ["crowd.html", "crowd", "ft.crowd", ["2 ชั่วโมง", "ต่อเครื่อง", "ต่อวัน"], ["2 hours", "per device", "per day"], ["2 小时", "每台设备", "每天"]]
  ];
  for (const [page, d, key, th, e, z] of per) {
    const t = thaiOf(read(page), key);
    assert.ok(t.length >= 1, page + ": " + key);
    for (const w of th) assert.ok(t[0].includes(w), page + " TH " + key + ": " + w + " in " + t[0]);
    const ev = dict(`i18n/en-${d}.js`)[key] || "", zv = dict(`i18n/zh-${d}.js`)[key] || "";
    for (const w of e) assert.ok(ev.includes(w), page + " EN " + key + ": " + w + " in " + ev);
    for (const w of z) assert.ok(zv.includes(w), page + " ZH " + key + ": " + w + " in " + zv);
  }
  // the Exam page no longer offers a different free trial ("1 room, 10 seats")
  assert.ok(!/10 ที่นั่ง/.test(read("exam.html")), "exam.html: old free trial wording");
  assert.ok(!/10 seats/.test(dict("i18n/en-exam.js")["exam.l.p1b"] || ""), "en-exam: old free trial wording");
});

/* ---------------- F7 ---------------- */
test("F7: claim checks pass on the repository and the free-tier rule really fails on 'free, every feature' wording (fixture copy)", async () => {
  const { checkClaims, RULES } = await import(path.join(ROOT, "tools", "accuracy-sync.mjs"));
  assert.deepEqual(checkClaims(ROOT), []);
  const rules = JSON.parse(read(RULES));
  assert.ok(rules.overclaims.some(r => r.id === "free-every-feature-th") && rules.overclaims.some(r => r.id === "free-every-feature-en") && rules.overclaims.some(r => r.id === "free-every-feature-zh"));
  assert.ok(rules.mustSay.some(r => r.key === "ft.notice"), "the notice is a mustSay rule");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lq-ft-"));
  try {
    const files = new Set([RULES, "nav.js", "exam-dashboard.js"]);
    for (const r of rules.mustSay) { r.html.forEach(f => files.add(f)); files.add(`i18n/en-${r.dict}.js`); files.add(`i18n/zh-${r.dict}.js`); }
    for (const f of rules.files) files.add(f.file);
    for (const rel of files) { const dst = path.join(tmp, rel); fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(path.join(ROOT, rel), dst); }
    assert.deepEqual(checkClaims(tmp), [], "fixture starts clean");
    const edit = (rel, from, to) => {
      const p = path.join(tmp, rel), s = fs.readFileSync(p, "utf8");
      assert.ok(s.includes(from), rel + ": " + from); fs.writeFileSync(p, s.replace(from, to));
      return () => fs.writeFileSync(p, s);
    };
    const expectErr = (undo, re) => { assert.ok(checkClaims(tmp).some(e => re.test(e)), String(re) + " " + JSON.stringify(checkClaims(tmp))); undo(); assert.deepEqual(checkClaims(tmp), []); };
    expectErr(edit("pricing.html", '<h1 data-i18n="pr.title">แพ็กเกจและราคา</h1>', '<h1 data-i18n="pr.title">แพ็กเกจและราคา ใช้งานฟรีทุกฟีเจอร์</h1>'), /overclaim \[free-every-feature-th\]/);
    expectErr(edit("i18n/en-pricing.js", '"pr.title": "', '"pr.title": "Free right now, every feature. '), /overclaim \[free-every-feature-en\]/);
    expectErr(edit("i18n/zh-pricing.js", '"pr.title": "', '"pr.title": "目前所有功能免费使用。'), /overclaim \[free-every-feature-zh\]/);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

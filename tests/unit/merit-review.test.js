"use strict";
// tests/unit/merit-review.test.js — Merit MVP, independent-review amendments (2026-11-12). FIXED TEST SET: written and
// hash-locked (~/LENSIQ-field/evals/merit/locked.sha256, "review amendment") BEFORE the fixes were made. Stricter only.
//   V1 wording lint: the reviewer's 78 cases (73 disguised or new wordings that must be caught: zero-width / soft-hyphen
//      / punctuation splits, fullwidth and Cyrillic look-alikes, traditional Chinese, hype, threats, contact details in
//      any form, links of any form and markup, prices in Thai digits / Thai and Chinese number words) + 5 clean ones,
//      plus the earlier 23 ordinary phrases: 0 false flags
//   V2 one lint for the Worker and the page: the page drops an item whose text fails the lint (defence in depth)
//   V3 crisis net reuses the fortune pages' own check (fortune-ai.js FortuneAI.crisis.check), not a copy
//   V4 crisis state survives blocked storage (in-memory per-page fallback)
//   V5 the interest notice shows the configured retention days (no fixed "90")
//   V6 the panel loads only on pages that run FortuneAI (the docs give the real count)
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { createEnv, req } = require("./backend-d1-shim.js");

const ROOT = join(__dirname, "..", "..");
const B = "../../backend/src/";
const backend = () => import(B + "merit.js");
const core = () => require("../../lensiq-merit-core.js");

// The reviewer's cases (lint-fuzz.mjs, 2026-11-12), verbatim. Invisible characters are written as escapes.
const MUST_CATCH = [
  ["รับประกัน", "plain"], ["รับ ประกัน", "space"], ["รับ​ประกัน", "ZWSP"], ["รับ­ประกัน", "soft hyphen"], ["รับ‍ประกัน", "ZWJ"],
  ["รับ⁠ประกัน", "word joiner"],
  ["แก้ดวง", "plain"], ["แก้-ดวง", "hyphen"], ["แ ก้ ด ว ง", "spaced"], ["แก้.ดวง", "dot"], ["เสริมดวงให้ปัง", "boost hype"], ["ไหว้แล้วปังแน่", "sure+hype"],
  ["ไหว้แล้วรวยเลย", "rich"], ["ชีวิตจะดีขึ้นทันตาเห็น", "instantly better"], ["ขอพรแล้วสมหวังทุกเรื่อง", "all wishes"], ["แก้ชงให้หายขาด", "cure chong"],
  ["ช่วยให้พ้นเคราะห์", "escape misfortune"],
  ["转运", "zh"], ["轉運", "trad zh"], ["保证", "zh"], ["保證", "trad zh"], ["包你发财", "get rich zh"], ["改運", "trad"], ["一定發財", "trad sure"],
  ["guaranteed", "en"], ["GUARANTEED", "caps"], ["guaranteeing", "ing"], ["g u a r a n t e e d", "spaced"], ["guar-anteed", "hyph"], ["gu​aranteed", "zwsp"],
  ["ｇｕａｒａｎｔｅｅｄ", "fullwidth"], ["guаranteed", "cyrillic a"], ["guarantee'd", "apos"],
  ["will fix your bad luck", "fix"], ["boost your luck fast", "boost"], ["your fortune turns around", "turns"], ["you will be rich", "rich"],
  ["works every time", "always"], ["100 percent", "percent"],
  ["โทร 081-234-5678", "phone"], ["โทร 08 1234 5678", "phone 2-4-4"], ["โทร 0812345678", "phone compact"], ["โทร ๐๘๑๒๓๔๕๖๗๘", "thai digits"],
  ["โทร zero eight one", "words"], ["+66 81 234 5678", "intl"], ["LINE @meritshop", "line id"], ["ไลน์ ไอดี merit99", "line id th"],
  ["bit.ly/abc", "shortlink"], ["t.me/merit", "telegram"], ["merit.co", "co"], ["merit . com", "spaced com"], ["merit[dot]com", "dot"], ["hxxps://x.y", "hxxps"],
  ["javascript:alert(1)", "js scheme"], ["<script>alert(1)</script>", "script"], ["<img src=x onerror=alert(1)>", "img"], ["<a href=x>click</a>", "anchor"],
  ["ถวาย 100 บาท", "price"], ["ถวาย ๑๐๐ บาท", "thai digit price"], ["ถวายร้อยบาท", "word price"], ["ทำบุญ 99.-", "price dash"], ["donate 500 THB", "thb"],
  ["500฿", "baht sign"], ["捐款500元", "zh price"], ["五百元", "zh word price"], ["只要99", "zh only"],
  ["หมดเขตพรุ่งนี้", "urgency"], ["รีบไปก่อนปีชงจะมา", "rush"], ["ไม่ไปจะเสียโอกาส", "lose chance"], ["ถ้าไม่ไหว้จะเกิดเรื่องไม่ดี", "threat"],
  ["if you do not pray, bad things happen", "threat en"], ["不拜会出事", "threat zh"], ["错过就没了", "miss zh"]
];
const MUST_PASS = [
  "ไหว้พระประจำวันเกิดเพื่อความสบายใจ", "Wear a colour you like for confidence", "佩戴你喜欢的颜色", "ทำบุญตักบาตรตอนเช้า", "Light incense and bow three times",
  // the 23 ordinary phrases of backend-merit.test.js B5, repeated here so both suites hold them
  "ตามความเชื่อ หลายคนนิยมไปไหว้พระที่วัดใกล้บ้านในวันเกิดของตน", "ถวายดอกไม้ ธูป และเทียน ด้วยใจสงบ", "บางคนนิยมพกของใช้สีที่ชอบติดตัว เช่น ผ้าเช็ดหน้า",
  "สวดมนต์และแผ่เมตตาก่อนนอน", "หลังตรุษจีน บางคนไปไหว้ไท้ส่วยเอี๊ยตามธรรมเนียม", "ใส่บาตรตอนเช้าตามกำลังของตน", "แต่งกายสุภาพเมื่อเข้าเขตศาสนสถาน",
  "ช่วงที่รู้สึกเหนื่อย ลองพักผ่อนให้พอและทำสมาธิสั้น ๆ",
  "By custom, many people visit a temple near home on their birthday", "Offer flowers, incense and candles with a calm mind",
  "Some people carry a small item in a colour they like", "Keep the shrine area clean and tidy", "After Chinese New Year some people pay respects at a Tai Sui hall",
  "Give what you comfortably can", "Sweets, milk and fruit are common offerings", "Dress modestly when you enter a place of worship",
  "很多人会在生日时到附近的寺庙参拜", "供奉鲜花、香和蜡烛，保持心境平和", "有人会随身携带自己喜欢颜色的小物件", "农历新年后，有人会到供奉太岁的庙宇参拜",
  "量力而行，随喜布施", "进入宗教场所时请穿着得体", "保持供桌整洁",
  // ordinary guidance that mentions calling ahead and dates (must not look like contact details)
  "ควรโทรสอบถามเวลาเปิดก่อนไป", "Check opening times before you go, for example on 2027-01-10.", "请在出发前确认开放时间。"
];

test("V1: the reviewer's 73 disguised / new wordings are all caught (TH / EN / ZH)", async () => {
  const M = await backend();
  assert.equal(MUST_CATCH.length, 73);
  const missed = MUST_CATCH.filter(([t]) => !M.lintMerit(t).length).map(([t, n]) => `${JSON.stringify(t)} [${n}]`);
  assert.deepEqual(missed, []);
});

test("V1: clean and ordinary phrases are never flagged (0 false flags)", async () => {
  const M = await backend();
  const flagged = MUST_PASS.map(t => [t, M.lintMerit(t)]).filter(([, h]) => h.length).map(([t, h]) => t + " -> " + JSON.stringify(h));
  assert.deepEqual(flagged, []);
});

test("V1: the sample seed and the page's UI wording still pass the hardened lint", async () => {
  const M = await backend(), S = require("../../lensiq-merit-seed.js"), C = core();
  for (const it of S) for (const f of ["title", "body", "place", "area"]) if (it[f]) for (const l of ["th", "en", "zh"]) assert.deepEqual(M.lintMerit(it[f][l]), [], `${it.id}.${f}.${l}`);
  for (const l of ["th", "en", "zh"]) for (const [k, v] of Object.entries(C.UI[l])) {
    assert.deepEqual(M.lintMerit(v, { only: ["urgency", "guarantee", "fix_luck", "fear", "lottery", "health", "markup"] }), [], `${l}.${k}`);
  }
});

test("V1: the admin API refuses a disguised wording (zero-width split) with merit_wording", async () => {
  const { handle } = await import(B + "index.js");
  const env = createEnv({ ADMIN_BOOTSTRAP_TOKEN: "bootstrap-" + "r".repeat(40), SECRETS_KEK: Buffer.alloc(32, 3).toString("base64") });
  const call = async (path, o = {}) => {
    const r = await handle(req(path, { method: o.method || "GET", body: o.body, headers: o.headers || {} }), env, {});
    return { status: r.status, j: await r.json() };
  };
  await call("/admin/api/bootstrap", { method: "POST", body: { token: "bootstrap-" + "r".repeat(40), username: "owner", password: "correct horse battery review" } });
  const tok = (await call("/admin/api/login", { method: "POST", body: { username: "owner", password: "correct horse battery review", mode: "bearer" } })).j.token;
  const body = { type: "place", tradition: "general", keys: ["any"],
    title: { th: "สถานที่", en: "A place", zh: "地点" },
    body: { th: "ไหว้แล้วรับ​ประกันว่าดี ตามความเชื่อของคนในท้องถิ่น", en: "Local people visit this place with a calm mind.", zh: "当地人以平静的心参拜此地。" } };
  const r = await call("/admin/api/merit/items", { method: "POST", body, headers: { Authorization: "Bearer " + tok } });
  assert.equal(r.status, 400); assert.equal(r.j.code, "merit_wording");
});

/* ---------------- V2 one lint, page side too ---------------- */
test("V2: the Worker and the page use the same lint module (lensiq-merit-lint.js)", async () => {
  const M = await backend(), L = require("../../lensiq-merit-lint.js");
  assert.equal(typeof L.lintMerit, "function");
  for (const [t] of MUST_CATCH) assert.deepEqual(M.lintMerit(t), L.lintMerit(t), t);
  assert.match(readFileSync(join(ROOT, "backend", "src", "merit.js"), "utf8"), /from "\.\.\/\.\.\/lensiq-merit-lint\.js"/);
  assert.match(readFileSync(join(ROOT, "nav.js"), "utf8"), /lensiq-merit-lint\.js/, "the page loads the same module");
});

test("V2: the page drops an item whose text fails the lint (even if the server sent it) and keeps clean ones", () => {
  const C = core(), L = require("../../lensiq-merit-lint.js");
  const ok = { id: "ok-1", type: "place", tradition: "general", status: "published", keys: ["any"], title: { th: "วัด", en: "Temple", zh: "寺庙" },
    body: { th: "ไหว้ด้วยใจสงบ", en: "Pay respects calmly", zh: "平静地参拜" }, place: null, area: null };
  const bad = { ...ok, id: "bad-1", body: { ...ok.body, en: "Guaranteed to fix your bad luck, call 081 234 5678" } };
  const badPlace = { ...ok, id: "bad-2", place: { th: "ร้าน", en: "bit.ly/x", zh: "店" } };
  const kept = C.safeItems([ok, bad, badPlace, null, 7], L.lintMerit).map(x => x.id);
  assert.deepEqual(kept, ["ok-1"]);
  assert.deepEqual(C.safeItems([ok], null).map(x => x.id), [], "no lint available: show nothing rather than unchecked text");
});

/* ---------------- V3 crisis reuse ---------------- */
test("V3: the Worker's crisis check is the fortune pages' own FortuneAI.crisis.check (imported, not copied)", async () => {
  const M = await backend(), FA = require("../../fortune-ai.js");
  const src = readFileSync(join(ROOT, "backend", "src", "merit.js"), "utf8");
  assert.match(src, /import FortuneAIModule from "\.\.\/\.\.\/fortune-ai\.js"/);
  assert.ok(!/ฆ่าตัว|suicid|自杀/.test(src), "no copied crisis pattern in merit.js");
  const phrases = ["ควรฆ่าตัวตายดีไหม", "อยากตาย", "โดนทำร้ายร่างกาย", "I can't go on anymore", "I want to die", "kill myself", "活着好累", "不想活了",
    "สมชาย", "Somchai", "小明", "line: somchai_88", "ไหว้พระที่วัด", "pay respects at a shrine"];
  for (const p of phrases) assert.equal(M.crisisCheck(p), FA.crisis.check(p), p);
  assert.equal(M.crisisCheck("Tum", "I want to die"), true, "any of several texts");
});

/* ---------------- V4 crisis state with blocked storage ---------------- */
// re-lock 2026-11-12 (owner decision 2026-11-12, session-only, L59): the state is the shared fortune crisis state, which
// does not depend on device storage; Merit keeps no copy of its own.
test("V4: blocked or missing storage — the shared crisis state still holds for this page", () => {
  const C = core(), CR = require("../../fortune-crisis.js");
  const win = { LQFortuneCrisis: CR };
  Object.defineProperty(win, "localStorage", { get() { throw new Error("blocked"); } });
  Object.defineProperty(win, "sessionStorage", { get() { throw new Error("blocked"); } });
  const doc = {};
  assert.equal(C.crisisActive(win, doc), false);
  CR.setActive(doc);
  assert.equal(C.crisisActive(win, doc), true, "blocked storage");
  assert.equal(C.crisisActive({ LQFortuneCrisis: CR }, doc), true, "no storage at all");
});

/* ---------------- V5 retention days in the notice ---------------- */
test("V5: the interest notice shows the configured retention days; without a value it names no number", () => {
  const C = core();
  const item = { id: "a-1", type: "place", tradition: "general", status: "published", keys: ["any"], title: { th: "ก", en: "A", zh: "甲" }, body: { th: "ข", en: "B", zh: "乙" } };
  for (const lang of ["th", "en", "zh"]) {
    const m = C.panelModel([item], { choice: "", keys: ["any"], lang, pageFlag: true, serverFlag: true, crisis: false, retentionDays: 30 });
    assert.match(m.paid.text["f.notice"], /30/, lang);
    assert.ok(!/90/.test(m.paid.text["f.notice"]), lang + ": no fixed 90");
    const m2 = C.panelModel([item], { choice: "", keys: ["any"], lang, pageFlag: true, serverFlag: true, crisis: false });
    assert.ok(!/\d/.test(m2.paid.text["f.notice"]), lang + ": no number when the server did not say");
  }
});

test("V5: GET /v1/merit/guidance tells the page the retention days (MERIT_INTEREST_DAYS)", async () => {
  const { handle } = await import(B + "index.js");
  for (const [v, want] of [[undefined, 90], ["30", 30]]) {
    const env = createEnv(v ? { MERIT_INTEREST_DAYS: v } : {});
    const r = await handle(req("/v1/merit/guidance"), env, {});
    assert.equal((await r.json()).interest_retention_days, want);
  }
});

/* ---------------- V6 pages ---------------- */
test("V6: nav.js loads the panel only on pages that run FortuneAI; the results doc gives that count", () => {
  const nav = readFileSync(join(ROOT, "nav.js"), "utf8");
  const m = /function meritHook\(\)[\s\S]*?\/\^\(([a-z0-9|]+)\)\\\.html\$\//.exec(nav);
  assert.ok(m, "meritHook page list");
  const pages = m[1].split("|");
  for (const p of pages) assert.match(readFileSync(join(ROOT, p + ".html"), "utf8"), /fortune-ai\.js/, p + " runs FortuneAI");
  assert.ok(!pages.includes("planner") && !pages.includes("luckycolor"));
  const doc = readFileSync(join(ROOT, "docs", "MERIT-RESULTS.md"), "utf8");
  assert.ok(doc.includes(pages.length + " fortune pages"), "doc states " + pages.length + " fortune pages");
  assert.ok(!/16 fortune pages|ดูดวง 16 หน้า/.test(doc));
});

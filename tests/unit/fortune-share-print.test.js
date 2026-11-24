"use strict";
// tests/unit/fortune-share-print.test.js — FIXED TEST SET, owner order 2026-11-16 items 1-2 ("fortune share & print").
// Written and locked BEFORE the build (~/LENSIQ-field/evals/fortune-share-print/, sha256 in evals-locks/fortune-share-print.sha256).
// The browser half is tests/e2e/fortune-share-print.e2e.mjs (Chrome) and tests/e2e/fortune-share-print-webkit.e2e.mjs (WebKit).
// Contract checked here (the pure half of fortune-share.js, loaded on every fortune page):
//   * one shared module on all 18 fortune pages (CLAUDE.md category 6), after the crisis net
//   * labels (share, print, toggles, LINE, Facebook, save image) complete in TH / EN / ZH
//   * card model: overview gist only + page name + the final disclaimer line + the 1323 help line + site link + date;
//     "include my photo" (face / palm pages only) and "include birth data" (birth date, age, name) are OFF by default;
//     what the user typed (question, dream, phone, account, plate) is never on the card
//   * card text passes the reading safety filter (FortuneAI.safety.isSafe) and the hard-limit lint rules (FA.lint "unsafe",
//     "caution-gentle", "remedy-safety"), and no crisis words (LQFortuneCrisis.check) — over generated readings TH / EN / ZH
//   * LINE share = https://line.me/R/share?text=<text + link>, never an image; Facebook = the sharer with the site URL only
//   * crisis flag / calm state: allowed() is false and share / print refuse
//   * print stylesheet: hides nav, buttons, menus and the help bar, expands every group, keeps colours, repeats the
//     disclaimer line on every printed page
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.join(__dirname, "..", "..");
global.PALM_KB = require("../../palm-kb.js");
global.FR_KB = require("../../faceread-kb.js");
const I18N = path.join(ROOT, "i18n");
for (const f of fs.readdirSync(I18N).filter(f => /^(?:zh|en)-kb-.+\.js$/.test(f))) require(path.join(I18N, f));
const FA = require("../../fortune-ai.js");
const RD = require("../../fortune-read.js");
const CR = require("../../fortune-crisis.js");
const HS = require("../../horoscope.js"), TR = require("../../tarot.js"), TKB = require("../../tarot-kb.js"), NM = require("../../numbers.js");
const IC = require("../../iching.js"), ZD = require("../../zodiac.js"), AS = require("../../astro.js"), DR = require("../../dream.js"), DKB = require("../../dream-kb.js");
const SP = require("../../fortune-share.js");

const PAGES = ["fortune", "faceread", "palm", "horoscope", "tarot", "iching", "bazi", "taksa", "lek7", "numbers", "fengshui", "dream",
  "zodiac", "astro", "lifegraph", "planner", "luckycolor", "report"];
const LANGS = ["th", "en", "zh"];
const LINE = {
  th: "เป็นหลักโหราศาสตร์ ซึ่งเป็นความเชื่อส่วนบุคคล โปรดใช้วิจารณญาณ",
  en: "Based on astrological principles, which are a matter of personal belief. Please use your own judgement.",
  zh: "基于命理学原则，属个人信仰，请自行判断。",
};
const SCRIPT = { th: /[฀-๿]/, en: /^[\x20-\x7E–—’·]+$/, zh: /[一-鿿]/ };
const DATE = new Date(2026, 10, 16, 9, 30);
const LINK = "https://anirut77.github.io/lensiq/horoscope.html";

// RE-LOCK 2026-11-16 (coordinator decision, option B; owner rule: no budget increases; lazy-load per coordinator decision
// 2026-11-16): the eager <script src="fortune-share.js"> tag pushed 6 pages over their speed budget (CI run 43794823885), so
// the module is now fetched by a small loader inside the fortune script every page already loads (fortune-notice.js, embedded
// byte-for-byte in fortune-read.js). The check below replaces "a script tag on every page" with: the loader is on every page,
// the crisis net is on every page, no page fetches fortune-share.js eagerly, and fortune-share.js / fortune-share-card.js load.
// The browser side (buttons within 2 s of a reading with no touch; the 6 pages back within budget) is in the e2e kit.
test("one shared module on all 18 fortune pages: the loader is on every page with the crisis net, fortune-share.js is loadable", () => {
  const notice = fs.readFileSync(path.join(ROOT, "fortune-notice.js"), "utf8"), read = fs.readFileSync(path.join(ROOT, "fortune-read.js"), "utf8");
  const m = /\/\* BEGIN fortune-share loader \*\/[\s\S]*?\/\* END fortune-share loader \*\//.exec(notice);
  assert.ok(m, "fortune-notice.js holds the fortune-share loader block");
  assert.ok(read.includes(m[0]), "fortune-read.js holds the same loader block (embedded copy)");
  const v = /["']fortune-share\.js\?v=(\d+)["']/.exec(m[0]);
  assert.ok(v, "the loader fetches fortune-share.js?v=<n>");
  for (const ev of ["pointerdown", "touchstart", "keydown", "scroll", "focusin"]) assert.ok(m[0].includes('"' + ev + '"'), "loader starts on " + ev);
  assert.ok(/fa-section/.test(m[0]), "the loader also starts when a reading is rendered");
  for (const p of PAGES) {
    const html = fs.readFileSync(path.join(ROOT, p + ".html"), "utf8");
    const hosts = (html.match(/<script src="fortune-(?:notice|read)\.js(?:\?v=\d+)?"/g) || []).length;
    assert.equal(hosts, 1, p + ".html must load exactly one of fortune-notice.js / fortune-read.js (the loader host)");
    assert.ok(/<script src="fortune-crisis\.js/.test(html), p + ".html loads the crisis net");
    assert.ok(!/<script src="fortune-share(?:-card)?\.js/.test(html), p + ".html fetches fortune-share.js eagerly (speed budget)");
  }
  for (const f of ["fortune-share.js", "fortune-share-card.js"]) assert.ok(fs.statSync(path.join(ROOT, f)).size > 1000, f + " exists");
  assert.equal(typeof SP.cardModel, "function", "fortune-share.js loads in Node");
  assert.deepEqual(Object.keys(SP.PAGES).sort(), [...PAGES].sort(), "SP.PAGES lists exactly the 18 fortune pages");
});

test("labels and page names are complete in TH / EN / ZH", () => {
  for (const k of ["share", "print", "photo", "birth", "line", "facebook", "save", "native", "close", "title", "refused"]) {
    for (const l of LANGS) {
      const s = SP.L[l] && SP.L[l][k];
      assert.ok(typeof s === "string" && s.trim().length > 0, `label ${k} missing in ${l}`);
      assert.ok(l === "en" ? SCRIPT.en.test(s) : SCRIPT[l].test(s), `label ${k} [${l}] is not in ${l}: ${s}`);
    }
  }
  for (const p of PAGES) for (const l of LANGS) {
    const n = SP.pageName(p, l);
    assert.ok(n && (l === "en" ? SCRIPT.en.test(n) : SCRIPT[l].test(n)), `page name ${p} [${l}]: ${n}`);
  }
  assert.deepEqual(SP.LINE, LINE, "the card / print disclaimer is the owner's final line");
});

test("photo toggle only on the face and palm pages; birth toggle where the page asks for birth data or a name", () => {
  const photo = PAGES.filter(p => SP.PAGES[p].photo).sort();
  assert.deepEqual(photo, ["faceread", "palm"]);
  for (const p of ["horoscope", "bazi", "taksa", "lek7", "lifegraph", "zodiac", "astro", "fengshui", "report", "numbers", "faceread"]) {
    assert.ok(SP.PAGES[p].personal, p + ": birth / name toggle expected");
  }
});

const PERSONAL = { birth: "15 สิงหาคม 2533 08:00", names: ["สมใจทดสอบ"], ages: ["34"], typed: ["0812345678", "ฝันเห็นงูใหญ่ในบ้าน", "งานใหม่จะดีไหม"] };
const GIST_TH = "สมใจทดสอบ อายุ 34 ปี ช่วงนี้เป็นจังหวะที่ค่อย ๆ เดินหน้า เบอร์ 0812345678 เกิด 15/08/2533 งานใหม่จะดีไหม การวางแผนทีละขั้นช่วยให้มั่นใจขึ้น";

test("card defaults: no photo, no birth data, no age, no name, nothing the user typed", () => {
  const m = SP.cardModel({ page: "horoscope", lang: "th", gist: GIST_TH, date: DATE, link: LINK, personal: PERSONAL, hasPhoto: true });
  assert.equal(m.photo, false, "photo must be off by default");
  assert.equal(m.birth, false, "birth data must be off by default");
  assert.equal(m.birthLine, null);
  const all = m.text;
  for (const bad of ["สมใจทดสอบ", "0812345678", "2533", "15/08", "อายุ 34", "34 ปี", "ฝันเห็นงู", "งานใหม่จะดีไหม", "สิงหาคม"]) {
    assert.ok(!all.includes(bad), "card holds " + bad + ": " + all);
  }
  assert.ok(/จังหวะที่ค่อย ๆ เดินหน้า/.test(all), "the overview stays: " + all);
  for (const l of LANGS) {
    const x = SP.cardModel({ page: "horoscope", lang: l, gist: GIST_TH, date: DATE, link: LINK });
    assert.equal(x.photo, false); assert.equal(x.birth, false);
  }
  // turned on: birth line and the name come back; typed text still never does
  const on = SP.cardModel({ page: "horoscope", lang: "th", gist: GIST_TH, date: DATE, link: LINK, personal: PERSONAL, include: { birth: true, photo: true }, hasPhoto: false });
  assert.equal(on.birth, true); assert.ok(on.birthLine && on.birthLine.includes("2533"), "birth line when turned on");
  assert.ok(on.text.includes("สมใจทดสอบ"), "name when turned on");
  assert.equal(on.photo, false, "no photo when the page has none");
  assert.ok(!on.text.includes("0812345678") && !on.text.includes("งานใหม่จะดีไหม"), "typed text is never on the card");
  const ph = SP.cardModel({ page: "faceread", lang: "th", gist: GIST_TH, date: DATE, link: LINK, include: { photo: true }, hasPhoto: true });
  assert.equal(ph.photo, true, "photo only when turned on");
  const np = SP.cardModel({ page: "horoscope", lang: "th", gist: GIST_TH, date: DATE, link: LINK, include: { photo: true }, hasPhoto: true });
  assert.equal(np.photo, false, "no photo option outside the face and palm pages");
});

test("card contents: page name, overview only, disclaimer line, 1323 help line, site link, date (TH / EN / ZH)", () => {
  const gist = { th: GIST_TH, en: "This is a period to move ahead step by step. Planning one thing at a time helps.", zh: "这段时间适合一步一步向前。一次计划一件事会更安心。" };
  for (const l of LANGS) {
    const m = SP.cardModel({ page: "tarot", lang: l, gist: gist[l], date: DATE, link: LINK, extra: "SECOND SECTION MUST NOT APPEAR" });
    assert.equal(m.title, SP.pageName("tarot", l));
    assert.equal(m.disclaimer, LINE[l]);
    assert.ok(/1323/.test(m.help), "help line " + m.help);
    assert.equal(m.link, LINK);
    assert.ok(/2026|2569/.test(m.dateText) && /16/.test(m.dateText), "date " + m.dateText);
    assert.ok(m.lines.length >= 1 && m.lines.length <= 8, "overview lines " + m.lines.length);
    assert.ok(!m.text.includes("SECOND SECTION"), "only the overview gist is on the card");
    for (const k of ["title", "disclaimer", "help", "link", "dateText"]) assert.ok(m.text.includes(m[k]), k + " in text");
  }
  // a long gist is cut to the card, never past it
  const long = SP.cardModel({ page: "tarot", lang: "th", gist: GIST_TH.repeat(12), date: DATE, link: LINK });
  assert.ok(long.lines.join("").length <= 420, "card overview is short: " + long.lines.join("").length);
});

/* generated readings: the overview gist of each, as the card would take it */
function readings() {
  const T = ["overall", "love", "work", "money"], out = [];
  let s = 77; const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
  const lcg = k => { let z = k >>> 0; return () => ((z = (Math.imul(z, 1664525) + 1013904223) >>> 0) / 4294967296); };
  const syms = DKB.SYMBOLS.map(x => x.id), moods = Object.keys(DKB.MOODS), times = Object.keys(DKB.TIMES);
  const gens = {
    horoscope: i => HS.buildFacts(HS.analyze({ y: 1950 + Math.floor(rnd() * 55), m: 1 + Math.floor(rnd() * 12), d: 1 + Math.floor(rnd() * 28), time: { h: 8, mi: 0 } }), { topic: T[i % 4], rng: lcg(i) }),
    tarot: i => TR.buildFacts([0, 1, 2].map(() => ({ id: TKB.cards[Math.floor(rnd() * 78)].id, rev: rnd() < 0.4 })), T[i % 4] === "overall" ? "general" : T[i % 4], "three", { rng: lcg(i) }),
    numbers: i => NM.buildFacts(NM.analyzePhone("08" + String(Math.floor(rnd() * 1e8)).padStart(8, "0")), T[i % 4], {}),
    iching: i => IC.buildFacts(IC.cast([0, 1, 2, 3, 4, 5].map(() => [6, 7, 8, 9][Math.floor(rnd() * 4)])), T[i % 4], { rng: lcg(i) }),
    zodiac: i => ZD.buildFacts(ZD.annual(Math.floor(rnd() * 12), 2026, 1950 + Math.floor(rnd() * 55)), T[i % 4], { rng: lcg(i) }),
    astro: i => AS.buildFacts(AS.chart({ y: 1950 + Math.floor(rnd() * 55), m: 1 + Math.floor(rnd() * 12), d: 1 + Math.floor(rnd() * 28), time: { h: 9, mi: 0 }, tz: 7, lat: 13.75, lon: 100.5 }), T[i % 4]),
    dream: i => DR.buildFacts([syms[Math.floor(rnd() * syms.length)], syms[Math.floor(rnd() * syms.length)]], moods[Math.floor(rnd() * moods.length)], times[Math.floor(rnd() * times.length)], T[i % 4], { rng: lcg(i) }),
  };
  for (const [page, g] of Object.entries(gens)) for (let i = 0; i < 6; i++) out.push({ page, f: g(i), seed: i + 1 });
  return out;
}

test("card text passes the reading safety filter and the hard-limit lint (generated readings, TH / EN / ZH)", () => {
  const bad = [];
  let n = 0;
  for (const { page, f, seed } of readings()) for (const lang of LANGS) {
    const r = FA.compose(f, { seed, lang });
    const ov = r.sections.find(x => x.id === "overview") || r.sections[0];
    const gist = RD.plan(ov.paragraphs, lang)[0].text;
    const m = SP.cardModel({ page, lang, gist, date: DATE, link: LINK, safety: FA.safety });
    n++;
    for (const line of m.lines) {
      if (!FA.safety.isSafe(line)) bad.push(`${page}/${lang} unsafe: ${line}`);
      if (CR.check(line)) bad.push(`${page}/${lang} crisis words: ${line}`);
    }
    const v = FA.lint({ lang, topic: f.topic || "overall", sections: [{ id: "overview", title: ov.title, paragraphs: [m.lines.join(lang === "zh" ? "" : " ")] }] })
      .filter(x => ["unsafe", "caution-gentle", "remedy-safety"].includes(x.rule));
    for (const x of v) bad.push(`${page}/${lang} lint ${x.rule}: ${x.excerpt}`);
    // the card adds nothing to the reading: every overview line comes from the gist
    const src = gist.replace(/\s+/g, "");
    for (const line of m.lines) if (!src.includes(line.replace(/[…\s]+/g, "").slice(0, 12))) bad.push(`${page}/${lang} line not from the gist: ${line}`);
  }
  assert.ok(n >= 120, "readings checked: " + n);
  assert.deepEqual(bad.slice(0, 12), []);
});

test("unsafe or crisis sentences never reach the card, whatever the gist holds", () => {
  const cases = {
    th: "ช่วงนี้เป็นจังหวะที่ดีสำหรับการวางแผน ปีนี้มีเกณฑ์สูญเสียคนสำคัญ ซื้อหวยเลข 27 แน่นอน",
    en: "This is a good time to plan ahead. You will die next year. Buy lottery number 27 for sure.",
    zh: "这段时间适合提前计划。你明年一定会死。买彩票27号一定中。",
  };
  for (const l of LANGS) {
    const m = SP.cardModel({ page: "tarot", lang: l, gist: cases[l], date: DATE, link: LINK, safety: FA.safety });
    for (const line of m.lines) assert.ok(FA.safety.isSafe(line), `${l}: unsafe line on the card: ${line}`);
    assert.ok(!/สูญเสีย|หวย|die|lottery|死|彩票/.test(m.lines.join(" ")), `${l}: ${m.lines.join(" | ")}`);
  }
});

test("LINE and Facebook links: text and the site link only, never an image", () => {
  const text = "ช่วงนี้เป็นจังหวะที่ดี";
  const u = SP.lineUrl(text, LINK);
  assert.ok(u.startsWith("https://line.me/R/share?text="), u);
  const q = decodeURIComponent(u.slice("https://line.me/R/share?text=".length));
  assert.ok(q.includes(text) && q.includes(LINK), q);
  assert.ok(!/data:|blob:|\.png|\.jpe?g/i.test(u), "no image in the LINE link");
  const fb = new URL(SP.fbUrl(LINK));
  assert.equal(fb.origin + fb.pathname, "https://www.facebook.com/sharer/sharer.php");
  assert.deepEqual([...fb.searchParams.keys()], ["u"], "the Facebook sharer gets the site URL only");
  assert.equal(fb.searchParams.get("u"), LINK);
  assert.throws(() => SP.fbUrl("blob:http://x/1"), /http/, "only http(s) links are shared");
});

const fakeDoc = attrs => ({ documentElement: { getAttribute: k => (k in attrs ? attrs[k] : null), setAttribute() {} } });

test("crisis flag or calm state: no share, no print", async () => {
  assert.equal(SP.allowed(fakeDoc({})), true, "a normal page allows sharing");
  assert.equal(SP.allowed(fakeDoc({ "data-lq-crisis": "1" })), false, "crisis");
  assert.equal(SP.allowed(fakeDoc({ "data-lq-calm": "1" })), false, "calm");
  const doc = fakeDoc({ "data-lq-calm": "1" });
  assert.equal(await SP.share({ doc }), false, "share refuses while calm");
  assert.equal(SP.print({ doc }), false, "print refuses while calm");
  const d2 = fakeDoc({});
  CR.setActive(d2);
  assert.equal(SP.allowed(d2), false, "after the support card was shown");
  assert.equal(await SP.share({ doc: d2 }), false);
  assert.equal(SP.print({ doc: d2 }), false);
});

test("print stylesheet: clean page, groups expanded, colours kept, disclaimer on every page", () => {
  const css = SP.PRINT_CSS;
  const print = (css.match(/@media print\s*\{([\s\S]*)\}\s*$/) || [])[1] || css.slice(css.indexOf("@media print"));
  assert.ok(css.includes("@media print"), "has a print block");
  for (const sel of ["#siteNav", ".lq-helpbar", "button", "nav", ".lq-toc", "[data-lq-sp-bar]"]) {
    assert.ok(print.includes(sel), "print hides " + sel);
  }
  assert.ok(/\.lq-more-body\s*\{[^}]*display\s*:\s*block\s*!important/.test(print), "every group body is shown");
  assert.ok(/line-clamp\s*:\s*(?:none|unset)/.test(print), "the 3-line clamp is lifted");
  assert.ok(/print-color-adjust\s*:\s*exact/.test(print), "swatch colours are kept");
  assert.ok(/thead|table-header-group/.test(print) && /tfoot|table-footer-group/.test(print), "the disclaimer repeats on every printed page (table header / footer)");
});

// APPENDED 2026-11-16 (owner decision 76, option ก; locked before the fix, nothing above changed): on the share card the palm
// line drawing (palm) and the sign / animal art derived from birth data (astro, zodiac) are OFF by default. Each page has its
// own switch ("art"), separate from the photo and birth switches, off every time the dialog opens. Pages whose art is not
// derived from the person (I Ching hexagram, dream symbols, face element glyph) are unchanged.
test("decision 76: palm drawing and birth-derived sign / animal art are off by default, each behind its own switch", () => {
  const GATED = ["astro", "palm", "zodiac"];
  assert.deepEqual(PAGES.filter(p => SP.PAGES[p].artOpt).sort(), GATED, "exactly palm, astro and zodiac gate their card art");
  for (const p of GATED) for (const l of LANGS) {
    const off = SP.cardModel({ page: p, lang: l, gist: GIST_TH, date: DATE, link: LINK, hasPhoto: true });
    assert.equal(off.art, false, `${p}/${l}: art must be off by default`);
    const other = SP.cardModel({ page: p, lang: l, gist: GIST_TH, date: DATE, link: LINK, include: { photo: true, birth: true }, hasPhoto: true });
    assert.equal(other.art, false, `${p}/${l}: the photo / birth switches do not turn the art on`);
    const on = SP.cardModel({ page: p, lang: l, gist: GIST_TH, date: DATE, link: LINK, include: { art: true } });
    assert.equal(on.art, true, `${p}/${l}: art when its own switch is on`);
    const label = SP.artLabel(p, l);
    assert.ok(String(label || "").trim() && SCRIPT[l].test(label), `${p}: art switch label in ${l}: ${label}`);
  }
  for (const p of ["iching", "dream", "faceread"]) {
    assert.equal(SP.cardModel({ page: p, lang: "th", gist: GIST_TH, date: DATE, link: LINK }).art, true, p + ": art not derived from the person stays");
  }
  const card = fs.readFileSync(path.join(ROOT, "fortune-share-card.js"), "utf8");
  assert.ok(/lqSpArt/.test(card), "the dialog has its own art switch (#lqSpArt)");
  assert.ok(/lqSpArt[\s\S]{0,300}\.checked\s*=\s*false/.test(card), "the art switch is reset to off when the dialog opens");
});

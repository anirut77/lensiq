// tests/e2e/fortune-compat.e2e.mjs — FIXED TEST SET, Compatibility (ดวงสมพงษ์), owner order 2026-11-16 part A, headless Chrome.
// Written and locked (~/LENSIQ-field/evals/fortune-compat/, sha256 in evals-locks/fortune-compat.sha256) BEFORE any product
// code on branch fortune-compat. Static and method half: tests/unit/fortune-compat.test.js; iPhone half:
// tests/e2e/fortune-compat-webkit.e2e.mjs.
// Page contract (compat.html): mode buttons button[data-cp-mode="pair"|"group"]; consent checkbox #cpConsent; one
// fieldset[data-cp-person="i"] per person with select[name=d], select[name=m], input[name=y] (C.E. or B.E.), input[name=t]
// (optional time), input[name=nick]; #cpAdd adds a person in group mode (3–8); #cpGo computes; #cpMsg messages; #cpResult
// holds the result: [data-compat-overview] (with svg[data-compat-wheel], one [data-compat-wheel-label][data-cat] per
// category, [data-compat-score] inside a [data-compat-detail]), [data-compat-agree] rows [data-agree-cat] with cells
// [data-agree-method][data-lean], category sections .fa-section.cp-cat[data-section] (grouped layout: .lq-gist, button.lq-more),
// group: [data-compat-map] cells [data-pair], [data-compat-role], [data-compat-workuse]. The page computes through the public
// window.LQCompat object (person / pair / group), so a spy on it sees every computation.
//   C1  consent [th, en, zh]: the second person's fields are disabled until #cpConsent is ticked; with it unticked, a submit
//       (values forced in) computes nothing (LQCompat.person / pair / group never called) and shows a message; the
//       statement says the person was informed and the user is responsible, in the page language
//   N1  no network: once the page and its lazy engine are loaded, computing makes no request at all; no request in the
//       session leaves the origin or carries the birth data; nothing with the birth data is left in local / session storage
//   R1  two people [th, en, zh] at 360 px: overview with the wheel (7 labels, each with icon, colour and text, >= 12 px, no
//       overlap; svg text >= 11 px tall, no overlap); agreement view 7 rows x 4 methods; every score inside its detail;
//       free tier (switch off): exactly the categories communication + values, nothing marked paid, no price or offer text;
//       a category opens on tap (button.lq-more, aria-expanded); no horizontal scroll; 1323 once and 1669 not visible;
//       the final disclaimer line in the page language; hard-limit wording absent from the result
//   G1  group [th, en, zh] at 360 px: 5 people: 10 map cells, 5 roles, the work-use line; add up to 8, then #cpAdd is disabled
//   P1  paid switch on (LENSIQ_FORTUNE_PAID = true): all 7 categories, the 5 beyond the free two marked data-lq-paid
//   X1  crisis (v3 re-lock 2026-11-17): a crisis phrase as a nickname sets the crisis state; the reading goes on in the free tier
//       with no price or paid content even with the paid switch on, no card, the closing line with tel:1323 at the end; the
//       next normal request keeps the state
//   X2  crisis flag set (LQFortuneCrisis.setActive) before computing, paid switch on: the same (v3)
//   X3  calm session (sessionStorage lq-fortune-calm = 1), paid switch on: the reading in the free tier only, nothing paid
import { assert } from "./cdp.mjs";

const S = JSON.stringify;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LANGS = ["th", "en", "zh"];
const HTML_LANG = { th: "th", en: "en", zh: "zh-Hans" };
const LINE = {
  th: "เป็นหลักโหราศาสตร์ ซึ่งเป็นความเชื่อส่วนบุคคล โปรดใช้วิจารณญาณ",
  en: "Based on astrological principles, which are a matter of personal belief. Please use your own judgement.",
  zh: "基于命理学原则，属个人信仰，请自行判断。",
};
const CONSENT = { th: [/แจ้ง/, /รับผิดชอบ/], en: [/informed/i, /responsible/i], zh: [/告知/, /负责/] };
const WORK = { th: /ไม่ใช้.*(?:จ้าง).*(?:เลื่อนตำแหน่ง).*(?:ค่าตอบแทน|เงินเดือน).*(?:เลิกจ้าง)/, en: /not .*hiring.*promotion.*pay.*dismissal/i, zh: /不.*招聘.*晋升.*薪酬.*解雇/ };
const BAN = {
  th: /เลิก(?:กัน|รา|คบ|ร่วม|หุ้น)|หย่า|แยกทาง|ไม่ควรแต่ง|ห้ามแต่ง|อย่าแต่ง|ไม่เข้ากัน|เข้ากันไม่ได้|มิฉะนั้น|ถ้าไม่(?:แก้|ทำพิธี|จ่าย)|ตาย|หวย/,
  en: /\b(?:break up|breakup|divorc\w*|split up|do not marry|don't marry|should not marry|incompatib\w*|not compatible|unless you pay|or else|death|lottery)\b/i,
  zh: /分手|离婚|散伙|不宜结婚|不要结婚|不相配|合不来|八字不合|否则|除非你|死|彩票/,
};
const PRICE = /฿|บาท|THB|ราคา|\bprice\b|价格|\d\s*元|ซื้อ|\bbuy\b|购买|ปลดล็อก|\bunlock\b|解锁|premium|พรีเมียม/i;
const A = { d: 14, m: 2, y: 1988, t: "07:30", nick: "Ann" }, B = { d: 3, m: 9, y: 2535, t: "", nick: "Ben" }; // B in B.E. (= 1992)
const GROUP = [A, B, { d: 21, m: 6, y: 1979, t: "", nick: "Chai" }, { d: 9, m: 11, y: 1995, t: "18:45", nick: "Dao" }, { d: 30, m: 4, y: 1984, t: "", nick: "Ek" }];

const open = (browser, lang, extra = []) => browser.newPage(null, { initScripts: [`try { localStorage.setItem("lq-lang", ${S(lang)}); } catch (e) {}`, ...extra] });
async function phone(page, w) {
  await page.send("Emulation.setDeviceMetricsOverride", { width: w, height: 800, deviceScaleFactor: 2, mobile: true });
  await page.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
}
async function load(page, base, lang) {
  await page.goto(`${base}/compat.html?nosw`);
  await page.waitFor(`document.documentElement.lang === ${S(HTML_LANG[lang])} && !!window.LQCompat && !!document.getElementById("cpGo")`, 15000);
  await sleep(400);
}
/** in the page: fill person i (forces values even into a disabled fieldset) */
const fill = (page, i, p) => page.evaluate((i2, p2) => {
  const fs = document.querySelector(`[data-cp-person="${i2}"]`);
  if (!fs) throw new Error("no person " + i2);
  const set = (sel, v) => { const e = fs.querySelector(sel); if (!e) throw new Error("no field " + sel); e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); };
  set("select[name=d]", String(p2.d)); set("select[name=m]", String(p2.m)); set("input[name=y]", String(p2.y));
  set("input[name=t]", p2.t || ""); set("input[name=nick]", p2.nick || "");
  return true;
}, i, p);
const tick = page => page.evaluate(() => { const c = document.getElementById("cpConsent"); if (!c.checked) c.click(); return c.checked; });
const go = page => page.evaluate(() => { document.getElementById("cpGo").click(); return true; });
const SPY = () => {
  window.__cpCalls = 0; const C = window.LQCompat;
  for (const k of ["person", "pair", "group"]) { const f = C[k]; C[k] = function () { window.__cpCalls++; return f.apply(this, arguments); }; }
  return true;
};
const resultReady = `(() => { const r = document.getElementById("cpResult"); return !!r && !r.hidden && !!(r.querySelector("[data-compat-overview]") || r.querySelector(".fa-support")); })()`;
const engineReady = "!!window.Astronomy && typeof window.Astronomy.EclipticGeoMoon === 'function'";

/** in the page: facts about the visible result */
const FACTS = () => {
  const vis = e => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden";
  const r = document.getElementById("cpResult");
  const rect = e => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
  const overlap = (a, b) => a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;
  const labels = [...r.querySelectorAll("[data-compat-wheel-label]")];
  const lab = labels.map(e => ({ cat: e.getAttribute("data-cat"), text: e.innerText.trim(), fs: parseFloat(getComputedStyle(e).fontSize),
    minFs: Math.min(...[e, ...e.querySelectorAll("*")].filter(x => x.childNodes && [...x.childNodes].some(n => n.nodeType === 3 && n.nodeValue.trim())).map(x => parseFloat(getComputedStyle(x).fontSize))),
    icon: !!e.querySelector("svg, [data-icon]"),
    colour: (() => { const sw = e.querySelector("[data-swatch]") || e; const c = getComputedStyle(sw).backgroundColor; return c && c !== "rgba(0, 0, 0, 0)" && c !== "transparent" ? c : getComputedStyle(sw).borderLeftColor; })(),
    rect: rect(e) }));
  let labOverlap = 0; for (let i = 0; i < lab.length; i++) for (let j = i + 1; j < lab.length; j++) if (overlap(lab[i].rect, lab[j].rect)) labOverlap++;
  const wheel = r.querySelector("svg[data-compat-wheel]");
  const st = wheel ? [...wheel.querySelectorAll("text")].filter(vis).map(t => rect(t)) : [];
  let stOverlap = 0; for (let i = 0; i < st.length; i++) for (let j = i + 1; j < st.length; j++) if (overlap(st[i], st[j])) stOverlap++;
  const scores = [...r.querySelectorAll("[data-compat-score]")].filter(vis).map(s => { const d = s.closest("[data-compat-detail]"); return d ? d.innerText.replace(s.innerText, "").trim().length : -1; });
  const cats = [...r.querySelectorAll(".fa-section.cp-cat[data-section]")].filter(vis);
  const agreeRows = [...r.querySelectorAll("[data-compat-agree] [data-agree-cat]")].map(row => [...row.querySelectorAll("[data-agree-method]")].map(c => c.getAttribute("data-lean")));
  const text = (() => { const c = r.cloneNode(true); c.querySelectorAll("[data-compat-workuse], script, style").forEach(e => e.remove()); return c.innerText; })();
  const tel = n => [...document.querySelectorAll(`a[href="tel:${n}"]`)].filter(vis).length;
  return {
    overview: vis(r.querySelector("[data-compat-overview]")), shareable: !!r.querySelector("[data-compat-overview][data-lq-shareable]"),
    wheel: vis(wheel), lab, labOverlap, svgText: st.map(x => x.h), stOverlap, scores,
    cats: cats.map(c => ({ id: c.getAttribute("data-section"), grouped: c.hasAttribute("data-lq-grouped"), gist: vis(c.querySelector(".lq-gist")),
      icon: !!c.querySelector("[data-icon]"), colour: getComputedStyle(c).getPropertyValue("--cat-color").trim(), title: (c.querySelector("h3, h4") || {}).innerText || "",
      paid: c.hasAttribute("data-lq-paid"), more: !!c.querySelector("button.lq-more") })),
    paidAny: !!document.querySelector("[data-lq-paid]"), agreeRows, text, price: null,
    sw: document.documentElement.scrollWidth, vw: innerWidth, tel1323: tel(1323), tel1669: tel(1669),
    disc: [...document.querySelectorAll(".lq-disc-line")].filter(vis).map(e => e.innerText.trim()),
    support: !!r.querySelector(".fa-support"), map: r.querySelectorAll("[data-compat-map] [data-pair]").length, roles: r.querySelectorAll("[data-compat-role]").length,
    work: (() => { const w = r.querySelector("[data-compat-workuse]") || document.querySelector("[data-compat-workuse]"); return w && vis(w) ? w.innerText : ""; })(),
  };
};

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    for (const lang of LANGS) {
      await check(`C1 [${lang}] consent: second person disabled until ticked; unticked submit computes nothing; statement wording`, async () => {
        const page = await open(browser, lang);
        try {
          await phone(page, 375); await load(page, base, lang);
          const r0 = await page.evaluate(() => ({ dis: document.querySelector('[data-cp-person="1"]').disabled, ticked: document.getElementById("cpConsent").checked,
            label: (document.getElementById("cpConsent").closest("label") || document.querySelector('label[for="cpConsent"]') || {}).innerText || "" }));
          assert(r0.dis === true && r0.ticked === false, "second person disabled and consent unticked at load: " + S(r0));
          for (const re of CONSENT[lang]) assert(re.test(r0.label), `consent label ${re} in ${lang}: ${r0.label}`);
          await page.evaluate(SPY);
          await fill(page, 0, A); await fill(page, 1, B); await go(page); await sleep(1200);
          const r1 = await page.evaluate(() => ({ calls: window.__cpCalls, res: !!document.querySelector("#cpResult [data-compat-overview]"), msg: (document.getElementById("cpMsg") || {}).innerText || "" }));
          assert(r1.calls === 0 && !r1.res, "nothing computed without consent: " + S(r1));
          assert(r1.msg.trim().length > 0, "a message tells the user to tick the statement");
          await tick(page);
          assert(await page.evaluate(() => !document.querySelector('[data-cp-person="1"]').disabled), "ticking enables the second person");
        } finally { await page.close(); }
      });
    }

    await check("N1 no network while computing; nothing leaves the origin; no birth data in storage", async () => {
      const page = await open(browser, "th");
      try {
        await phone(page, 375); await load(page, base, "th");
        await tick(page);
        await page.waitFor(engineReady, 15000); await sleep(800);
        const before = page.requests.length;
        await fill(page, 0, A); await fill(page, 1, B); await go(page);
        await page.waitFor(resultReady, 15000); await sleep(1500);
        const during = page.requests.slice(before).map(q => q.url);
        assert(during.length === 0, "requests while computing: " + S(during));
        const origin = new URL(base).origin;
        const away = page.requests.filter(q => !q.url.startsWith(origin) && !/^(data|blob|about):/.test(q.url)).map(q => q.url);
        assert(away.length === 0, "requests leaving the origin: " + S(away));
        const leak = page.requests.filter(q => /1988|2535|1992/.test(q.url + " " + (q.postData || ""))).map(q => q.url);
        assert(leak.length === 0, "birth data in a request: " + S(leak));
        const store = await page.evaluate(() => { const o = []; for (const st of [localStorage, sessionStorage]) for (let i = 0; i < st.length; i++) o.push(st.key(i) + "=" + st.getItem(st.key(i))); return o.join("\n"); });
        assert(!/1988|2535|1992|Ann\b|Ben\b/.test(store), "birth data or names in storage: " + store.slice(0, 300));
      } finally { await page.close(); }
    });

    for (const lang of LANGS) {
      await check(`R1 [${lang}] two people at 360 px: wheel, agreement, scores with detail, free tier, open on tap, layout, help, disclaimer`, async () => {
        const page = await open(browser, lang);
        try {
          await phone(page, 360); await load(page, base, lang);
          await tick(page); await fill(page, 0, A); await fill(page, 1, B); await go(page);
          await page.waitFor(resultReady, 20000); await sleep(800);
          const f = await page.evaluate(FACTS);
          assert(f.overview && !f.support, "overview shown");
          assert(f.shareable, "overview carries data-lq-shareable (share / print hook)");
          assert(f.wheel, "wheel shown");
          assert(f.lab.length === 7, "7 wheel labels: " + f.lab.length);
          for (const l of f.lab) {
            assert(l.text.length > 1 && l.icon && l.colour, "label has text, icon and colour: " + S(l));
            assert(l.minFs >= 12, "label text >= 12 px: " + S(l));
          }
          assert(new Set(f.lab.map(l => l.cat)).size === 7, "one label per category");
          assert(f.labOverlap === 0, "wheel labels do not overlap");
          assert(f.svgText.every(h => h >= 11), "svg text >= 11 px tall: " + S(f.svgText));
          assert(f.stOverlap === 0, "svg text does not overlap");
          assert(f.agreeRows.length === 7 && f.agreeRows.every(r => r.length === 4), "agreement 7 x 4: " + S(f.agreeRows));
          assert(f.agreeRows.flat().every(v => ["fit", "mixed", "care", "none"].includes(v)), "agreement leans");
          assert(f.scores.length >= 3 && f.scores.every(n => n >= 40), "every score sits inside its detail: " + S(f.scores));
          assert(S(f.cats.map(c => c.id)) === S(["communication", "values"]), "free tier: two categories: " + S(f.cats.map(c => c.id)));
          for (const c of f.cats) assert(c.grouped && c.gist && c.icon && c.colour && c.title.trim() && !c.paid, "category layout: " + S(c));
          assert(!f.paidAny, "nothing marked paid with the switch off");
          assert(!PRICE.test(f.text), "no price or offer text: " + (f.text.match(PRICE) || [])[0]);
          assert(!BAN[lang].test(f.text), "hard-limit wording: " + (f.text.match(BAN[lang]) || [])[0]);
          assert(f.sw <= f.vw + 1, `no horizontal scroll: ${f.sw} > ${f.vw}`);
          assert(f.tel1323 === 1 && f.tel1669 === 0, `help: 1323 x${f.tel1323}, 1669 x${f.tel1669}`);
          assert(f.disc.includes(LINE[lang]), "disclaimer line: " + S(f.disc));
          const opened = await page.evaluate(() => {
            const b = document.querySelector("#cpResult .fa-section.cp-cat button.lq-more");
            if (!b) return { none: true };
            const was = b.getAttribute("aria-expanded"); b.click();
            const body = document.getElementById((b.getAttribute("aria-controls") || "").split(" ")[0]);
            return { was, now: b.getAttribute("aria-expanded"), shown: !!body && body.getClientRects().length > 0 };
          });
          assert(opened.was === "false" && opened.now === "true" && opened.shown, "a category opens on tap: " + S(opened));
          const sw2 = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
          assert(sw2 <= 1, "no horizontal scroll after opening");
        } finally { await page.close(); }
      });
    }

    for (const lang of LANGS) {
      await check(`G1 [${lang}] group of 5 at 360 px: map, roles, work-use line; at most 8`, async () => {
        const page = await open(browser, lang);
        try {
          await phone(page, 360); await load(page, base, lang);
          await page.evaluate(() => { document.querySelector('button[data-cp-mode="group"]').click(); return true; });
          await sleep(300);
          await tick(page);
          const have = await page.evaluate(() => document.querySelectorAll("[data-cp-person]").length);
          assert(have === 3, "group starts with 3 people: " + have);
          await page.evaluate(() => { document.getElementById("cpAdd").click(); document.getElementById("cpAdd").click(); return true; });
          for (let i = 0; i < 5; i++) await fill(page, i, GROUP[i]);
          await go(page);
          await page.waitFor(resultReady, 25000); await sleep(800);
          const f = await page.evaluate(FACTS);
          assert(f.map === 10, "10 map cells: " + f.map);
          assert(f.roles === 5, "5 roles: " + f.roles);
          assert(WORK[lang].test(f.work), "work-use line: " + f.work);
          assert(!BAN[lang].test(f.text), "hard-limit wording: " + (f.text.match(BAN[lang]) || [])[0]);
          assert(!f.paidAny && !PRICE.test(f.text), "nothing paid");
          assert(f.sw <= f.vw + 1, `no horizontal scroll: ${f.sw} > ${f.vw}`);
          assert(f.tel1323 === 1 && f.tel1669 === 0, "help button once");
          const r = await page.evaluate(() => { const b = document.getElementById("cpAdd"); for (let i = 0; i < 6; i++) b.click(); return { n: document.querySelectorAll("[data-cp-person]").length, dis: b.disabled }; });
          assert(r.n === 8 && r.dis, "at most 8 people, then add is disabled: " + S(r));
        } finally { await page.close(); }
      });
    }

    await check("P1 paid switch on: all 7 categories, the 5 beyond the free two marked data-lq-paid", async () => {
      const page = await open(browser, "en", ["window.LENSIQ_FORTUNE_PAID = true;"]);
      try {
        await phone(page, 375); await load(page, base, "en");
        await tick(page); await fill(page, 0, A); await fill(page, 1, B); await go(page);
        await page.waitFor(resultReady, 20000); await sleep(600);
        const f = await page.evaluate(FACTS);
        assert(f.cats.length === 7, "7 categories: " + f.cats.map(c => c.id));
        const paid = f.cats.filter(c => c.paid).map(c => c.id).sort();
        assert(S(paid) === S(["daily", "decisions", "longterm", "money", "work"]), "paid categories marked: " + S(paid));
      } finally { await page.close(); }
    });

    // RE-LOCK 2026-11-17 (crisis v3, owner decision 2026-11-17; branch crisis-v3-2 after the compat go-live merge; ledger
    // docs/CRISIS-V3-RELOCKS.md): X1 / X2 "the support card replaces the result" -> the crisis state is set, the reading goes on
    // (overview shown, free tier only, nothing paid, no price), no card, no 1669, and the closing line with tel:1323 sits at the
    // end of #cpResult; the state holds for the next request. "Nothing paid / no price" kept unchanged.
    const v3 = `(() => { const r = document.getElementById("cpResult"), vis = e => !!e && e.getClientRects().length > 0;
      const close = [...r.querySelectorAll(".lq-helpline")].filter(vis), last = r.lastElementChild;
      return { state: document.documentElement.getAttribute("data-lq-crisis") === "1", card: [...document.querySelectorAll(".fa-support, .fa-soft")].some(vis),
        lines: close.length, tels: close.length ? [...close[0].querySelectorAll('a[href^="tel:"]')].map(a => a.getAttribute("href")) : [],
        atEnd: close.length === 1 && (last === close[0] || last.contains(close[0])) }; })()`;
    const okV3 = (f, c, where) => {
      assert(c.state, where + ": the crisis state is set");
      assert(!c.card && !f.support, where + ": no card or soft step");
      assert(f.overview, where + ": the reading goes on (overview shown)");
      assert(!f.paidAny && !PRICE.test(f.text), where + ": nothing paid, no price");
      assert(f.tel1669 === 0, where + ": no 1669");
      assert(c.lines === 1 && S(c.tels) === S(["tel:1323"]) && c.atEnd, where + ": one closing line with tel:1323 at the end: " + S(c));
    };
    for (const lang of LANGS) {
      await check(`X1 [${lang}] crisis phrase as a nickname: the reading goes on gently (v3), no card, nothing paid, closing line at the end; the state holds`, async () => {
        const page = await open(browser, lang, ["window.LENSIQ_FORTUNE_PAID = true;"]);
        try {
          await phone(page, 375); await load(page, base, lang);
          const phrase = { th: "อยากตาย", en: "I want to die", zh: "我想死" }[lang];
          await tick(page); await fill(page, 0, Object.assign({}, A, { nick: phrase })); await fill(page, 1, B); await go(page);
          await page.waitFor(resultReady, 20000); await sleep(500);
          okV3(await page.evaluate(FACTS), await page.evaluate(v3), "crisis nickname");
          await fill(page, 0, A); await go(page); await sleep(1500);
          okV3(await page.evaluate(FACTS), await page.evaluate(v3), "next request");
        } finally { await page.close(); }
      });
    }

    await check("X2 crisis flag set before computing (paid switch on): the reading goes on gently (v3), nothing paid, closing line", async () => {
      const page = await open(browser, "th", ["window.LENSIQ_FORTUNE_PAID = true;"]);
      try {
        await phone(page, 375); await load(page, base, "th");
        await page.evaluate(() => { window.LQFortuneCrisis.setActive(document); return true; });
        await tick(page); await fill(page, 0, A); await fill(page, 1, B); await go(page);
        await page.waitFor(resultReady, 20000); await sleep(500);
        okV3(await page.evaluate(FACTS), await page.evaluate(v3), "flag set first");
      } finally { await page.close(); }
    });

    await check("X3 calm session (paid switch on): the reading in the free tier only", async () => {
      const page = await open(browser, "th", ["window.LENSIQ_FORTUNE_PAID = true;", 'try { sessionStorage.setItem("lq-fortune-calm", "1"); } catch (e) {}']);
      try {
        await phone(page, 375); await load(page, base, "th");
        await tick(page); await fill(page, 0, A); await fill(page, 1, B); await go(page);
        await page.waitFor(resultReady, 20000); await sleep(500);
        const f = await page.evaluate(FACTS);
        assert(f.overview && !f.paidAny, "reading without paid parts");
        assert(S(f.cats.map(c => c.id)) === S(["communication", "values"]), "free tier: " + S(f.cats.map(c => c.id)));
        assert(!PRICE.test(f.text), "no price");
      } finally { await page.close(); }
    });
  } finally { await browser.close(); }
}

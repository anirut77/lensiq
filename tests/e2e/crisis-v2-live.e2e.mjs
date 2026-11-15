// tests/e2e/crisis-v2-live.e2e.mjs — FIXED TEST SET, crisis flow v2 go-live (owner decision 1 option ก 2026-11-15; decision 54 ข
// "one small button only at the top in the normal state", no number more than once per page; decision 23 default ก: no free
// belief guidance in the crisis or calm state; CLAUDE.md hard limit 3). Locked BEFORE the build (evals-locks/crisis-v2-live.sha256,
// ~/LENSIQ-field/evals/crisis-v2-live/). Static half: tests/unit/crisis-v2-live.test.js. Helpers: crisis-flow-lib.mjs (v2's locked lib).
// Phone width 375 px unless stated.
//   A  each help number at most once per page: normal state after a reading (TH), calm state on every fortune page (TH / EN / ZH;
//      1323 exactly once = the top button, the others only behind the ONE "more help numbers" control, each once when opened),
//      crisis state (the full card with every number, the reading replaced), after "ดูคำทำนายต่อ" (each at most once again).
//      No pinned bar, no dock, no help line under the reading: the only visible help element is #lqHelpTop.
//   B  no echo: name-like distress entries ("Kill…", Thai and Chinese names with a distress word) never come back on the soft
//      step, the card, or the reading after "Just the reading" / continue (visible text, title, address).
//   C  no remedies, free belief guidance panel, price, paid or straight content in the calm or crisis state, TH / EN / ZH
//      (straight forced ON with an adult who chose it; merit server stub with the paid flags ON). Control: the same zodiac page in
//      the normal state does show the guidance panel (so the check can see it).
//   D  calm state: the top 1323 button is prominent (≥ 52 px tall, number ≥ 18 px, contrast ≥ 7:1, larger than in the normal
//      state), in the first screen, one touch tap reaches tel:1323, and it stays in view while the reading is on screen.
import { assert } from "./cdp.mjs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { ADULT, CALM, FLAG_ON, LANGS, NO_READING, PAGES, RUN, S, answerSoft, ask, cardShown, continueToReading, meritStub, open, sleep, softShown }
  from "./crisis-flow-lib.mjs";

const require = createRequire(import.meta.url);
const W = 375;
const NUMS = ["1323", "1669", "191", "1300", "021136789"];
const OTHERS = ["1669", "191", "1300", "021136789"];
const ALL_PAGES = PAGES.concat(["cat-fortune"]);
RUN["cat-fortune"] = { url: "cat-fortune.html", none: true };

/** visible places where n shows (fortune-live.e2e.mjs H1 rule): visible tel:n links, plus visible text nodes with n outside such links */
const PLACES = n => `(() => {
  const vis = e => { if (!e || !e.isConnected) return false;
    if (e.checkVisibility && !e.checkVisibility({ visibilityProperty: true, opacityProperty: true })) return false;
    for (let x = e; x && x.nodeType === 1; x = x.parentElement) { if (x.tagName === "DETAILS" && !x.open && x !== e && !(x.firstElementChild && x.firstElementChild.contains(e))) return false; }
    const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const re = new RegExp("(?<!\\\\d)" + ${S(n)} + "(?!\\\\d)");
  const links = [...document.querySelectorAll('a[href^="tel:"]')].filter(a => a.getAttribute("href").replace(/\\D/g, "") === ${S(n)} && vis(a));
  const out = links.map(a => "link:" + (a.closest("[id]") ? a.closest("[id]").id : "") + (a.closest(".fa-support") ? "(card)" : ""));
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = w.nextNode(); t; t = w.nextNode()) {
    const p = t.parentElement;
    if (!p || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(p.tagName) || !re.test(t.nodeValue.replace(/(\\d)\\s(?=\\d)/g, "$1"))) continue;
    if (links.some(a => a.contains(p))) continue;
    if (vis(p)) out.push("text:" + (p.closest("[id]") ? p.closest("[id]").id : "") + (p.closest(".fa-support") ? "(card)" : "") + ":" + t.nodeValue.replace(/\\s+/g, " ").trim().slice(0, 50));
  }
  return out; })()`;
/** visible help elements other than #lqHelpTop and the card (pinned bars, docks, lines under a reading) */
const EXTRA_HELP = `[...document.querySelectorAll(".lq-helpline, .lq-helpbar, .lq-helpline-dock, .lq-helpline-result, .lq-helpbar-pin, .lq-helpbar-page")]
  .filter(e => e.id !== "lqHelpTop" && !e.closest("#lqHelpTop") && !e.closest(".fa-support") && e.getClientRects().length && getComputedStyle(e).display !== "none"
    && getComputedStyle(e).visibility !== "hidden").map(e => e.className)`;
const OPEN_MORE = `(() => { const t = document.getElementById("lqHelpTop"); if (!t) return -1;
  const m = [...t.querySelectorAll("details, [data-lq-more]")]; m.forEach(d => { if (d.tagName === "DETAILS") d.open = true; else d.click(); }); return m.length; })()`;

async function counts(pg) { const o = {}; for (const n of NUMS) o[n] = await pg.evaluate(PLACES(n)); return o; }
/** the calm / normal rule: 1323 exactly once, the others `others` times (0 with the control closed, 1 when opened) */
function countProblems(c, others, tag) {
  const bad = [];
  if (c["1323"].length !== 1) bad.push(`${tag}: 1323 shows ${c["1323"].length} times (want 1) ${S(c["1323"])}`);
  for (const n of OTHERS) if (c[n].length !== others) bad.push(`${tag}: ${n} shows ${c[n].length} times (want ${others}) ${S(c[n])}`);
  return bad;
}

const NAMES = [ // [page, typed text, parts that must never come back, language]
  ["horoscope", "Kill Me Please", ["Kill Me Please", "Kill"], "en"], ["horoscope", "สมหญิง ช่วยด้วย", ["สมหญิง", "ช่วยด้วย"], "th"],
  ["numbers", "Killme Now Somchai", ["Killme", "Somchai"], "en"], ["numbers", "ปิยะนุช อยากตาย", ["ปิยะนุช", "อยากตาย"], "th"],
  ["report", "สมหญิง ช่วยด้วย", ["สมหญิง", "ช่วยด้วย"], "th"], ["report", "Kill Me Please", ["Kill Me Please", "Kill"], "en"],
  ["faceread", "ปิยะนุช อยากตาย", ["ปิยะนุช", "อยากตาย"], "th"], ["palm", "Kill Me Please", ["Kill Me Please", "Kill"], "en"],
  ["horoscope", "小明 救救我", ["小明", "救救我"], "zh"], ["numbers", "王芳 不想活了", ["王芳", "不想活"], "zh"],
  ["tarot", "สมศักดิ์ อยากตายจริงๆ", ["สมศักดิ์", "อยากตาย"], "th"], ["iching", "Kill myself tonight, Somsak", ["Somsak", "Kill myself"], "en"],
];
const ECHO = words => `(() => { const t = document.body.innerText + "\\n" + document.title + "\\n" + decodeURIComponent(location.href);
  return ${S(words)}.filter(w => (/^[A-Za-z ,]+$/.test(w) ? new RegExp("\\\\b" + w + "\\\\b", "i") : new RegExp(w)).test(t)); })()`;

const FORBID_SEL = [".lq-merit", ".lq-merit-card", "[data-lq-belief]", "[data-lq-remedy]", "[data-lq-upsell]", "[data-lq-paid]", "[data-lq-paid-link]", ".lq-merit-paid",
  'a[href*="pricing.html"]', 'a[href*="terms.html#t9"]', ".fa-straight", "[data-lq-straight]", '[data-fa-mode="straight"]'];
// guidance wording, not page names: the zodiac page is called "ปีชง · ไท้ส่วย / Tai Sui / 犯太岁" and the planner lists the event
// "ทำบุญบ้าน" (house blessing); those names are not advice
// RE-LOCK 2026-11-16 (first build run, same principle): the planner's Chinese event description "搬入新居、新居祈福" (move into a new
// home, house blessing; i18n/zh-planner.js pl.ev.moveS) is an event name like "ทำบุญบ้าน", not advice; 祈福 after 新居 is not counted.
const FORBID_TEXT = {
  th: /ไหว้ไท้ส่วย|แก้ชง|ทำบุญ(?!บ้าน)|ตักบาตร|สวดมนต์|อัญมณี|พลอย|ของมงคล|เครื่องราง|วัตถุมงคล|ราคา|\d\s*บาท|฿|ดูตรง ๆ|แผนมู|ทำบุญแทน/,
  en: /(?:pray|offer\w*|worship\w*|respects?) (?:to|for) (?:the )?Tai Sui|make merit|\bpray(?:er|ing)?\b|\bchant\w*|gemstones?|sapphire|lucky charms?|amulets?|talismans?|\bprices?\b|฿|\bbaht\b|read it straight|merit plan/i,
  zh: /拜太岁|化太岁|安太岁|行善|积德|诵经|(?<!新居)祈福|宝石|吉祥物|护身符|价格|泰铢|฿|“直说”|直说模式/,
};
const FORBIDDEN = lang => `(() => {
  const vis = e => !!e && e.getClientRects().length > 0 && getComputedStyle(e).display !== "none" && getComputedStyle(e).visibility !== "hidden" && !e.closest("[hidden]");
  const sel = ${S(FORBID_SEL)}.flatMap(s => [...document.querySelectorAll(s)].filter(vis).map(e => s + "#" + (e.id || e.className || e.tagName).toString().slice(0, 40)));
  const txt = document.body.innerText, m = txt.match(new RegExp(${S(FORBID_TEXT[lang].source)}, ${S(FORBID_TEXT[lang].flags)}));
  return { sel, word: m ? m[0] + " … " + txt.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\\s+/g, " ") : null }; })()`;

/** facts about the 1323 link in #lqHelpTop */
const TOP_BTN = `(() => {
  const a = [...document.querySelectorAll('#lqHelpTop a[href="tel:1323"]')].find(x => x.getClientRects().length);
  if (!a) return null;
  const r = a.getBoundingClientRect(), cs = getComputedStyle(a), n = a.querySelector(".lq-call-mini-n") || a;
  const rgb = s => (s.match(/[\\d.]+/g) || []).map(Number);
  const lum = c => { const v = c.slice(0, 3).map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  let bg = rgb(cs.backgroundColor); for (let e = a.parentElement; e && (bg.length < 3 || bg[3] === 0); e = e.parentElement) bg = rgb(getComputedStyle(e).backgroundColor);
  const fg = rgb(getComputedStyle(n).color), L1 = lum(fg), L2 = lum(bg.length >= 3 ? bg : [255, 255, 255]);
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { w: r.width, h: r.height, top: r.top, bottom: r.bottom, left: r.left, right: r.right, vh: innerHeight, vw: innerWidth,
    font: parseFloat(getComputedStyle(n).fontSize), contrast: (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05),
    covered: !(hit && (hit === a || a.contains(hit))), hit: hit ? hit.tagName + "." + hit.className : null }; })()`;
const TOP_IN_VIEW = `(async () => {
  const full = () => { const a = [...document.querySelectorAll('#lqHelpTop a[href="tel:1323"]')].find(x => x.getClientRects().length); if (!a) return false;
    const r = a.getBoundingClientRect(); if (!(r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth)) return false;
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!hit && (hit === a || a.contains(hit)); };
  const secs = [...document.querySelectorAll(".fa-section, .rp-part")].filter(e => e.getClientRects().length && !e.closest("[hidden]"));
  const out = [];
  for (const t of secs.length ? [secs[0], secs[Math.floor(secs.length / 2)], secs[secs.length - 1]] : []) { t.scrollIntoView({ block: "center" }); await new Promise(r => setTimeout(r, 300)); out.push(full()); }
  window.scrollTo(0, 0); return out; })()`;

export default async function ({ base, launch, check, fakeCams, repo }) {
  const seed = require(join(repo, "lensiq-merit-seed.js")).map(x => ({ ...x, updated_at: 1 }));
  const INIT = [FLAG_ON, ADULT, CALM, meritStub(seed)];
  const INIT_NORMAL = [FLAG_ON, ADULT, meritStub(seed)];
  const initFor = (name, init) => (name === "report" ? init.filter(x => !/merit\/guidance/.test(x)) : init);
  const browser = await launch();
  try {
    await check("A1: normal state after a reading (tarot, zodiac, horoscope, dream; TH): 1323 once, no other number", async () => {
      const bad = [];
      for (const name of ["tarot", "zodiac", "horoscope", "dream"]) {
        const pg = await open(browser, base, name, "th", { width: W, fakeCams });
        try {
          await ask(pg, name, "");
          bad.push(...countProblems(await counts(pg), 0, name));
          const extra = await pg.evaluate(EXTRA_HELP); if (extra.length) bad.push(name + ": extra help element " + S(extra));
        } catch (e) { bad.push(name + ": " + String(e.message || e).slice(0, 200)); } finally { await pg.close(); }
      }
      assert(!bad.length, bad.length + " problem(s):\n       " + bad.join("\n       "));
    });

    for (const lang of LANGS) {
      await check(`A2: ${lang}: calm tab on every fortune page: 1323 once, others only behind the one 'more help numbers' control (each once when opened), no extra help element`, async () => {
        const bad = [];
        for (const name of ALL_PAGES) {
          const pg = await open(browser, base, name, lang, { init: initFor(name, INIT), width: W, fakeCams });
          try {
            await ask(pg, name, "");
            bad.push(...countProblems(await counts(pg), 0, name + " (closed)"));
            const extra = await pg.evaluate(EXTRA_HELP); if (extra.length) bad.push(name + ": extra help element " + S(extra));
            const nMore = await pg.evaluate(OPEN_MORE);
            if (nMore !== 1) bad.push(`${name}: ${nMore} 'more help numbers' controls in #lqHelpTop (want 1)`);
            await sleep(250);
            bad.push(...countProblems(await counts(pg), 1, name + " (opened)"));
          } catch (e) { bad.push(name + ": " + String(e.message || e).slice(0, 200)); } finally { await pg.close(); }
        }
        assert(!bad.length, bad.length + " problem(s):\n       " + bad.join("\n       "));
      });
    }

    await check("A3: crisis state (tarot, dream, iching; TH / EN / ZH): the full card with every number, the reading replaced; after continue each number at most once", async () => {
      const bad = [];
      const CRISIS = { th: "อยากตายจริงๆ ไม่ไหวแล้ว", en: "I want to die tonight", zh: "我真的不想活了" };
      for (const lang of LANGS) for (const name of ["tarot", "dream", "iching"]) {
        const tag = `${name} ${lang}`;
        const pg = await open(browser, base, name, lang, { width: W });
        try {
          await ask(pg, name, CRISIS[lang]);
          const card = await pg.evaluate(`(() => { const c = [...document.querySelectorAll(".fa-support")].find(e => e.getClientRects().length); if (!c) return null;
            return { tels: [...c.querySelectorAll('a[href^="tel:"]')].filter(a => a.getClientRects().length).map(a => a.getAttribute("href").replace(/\\s+/g, "")),
              sections: [...document.querySelectorAll(".fa-section")].filter(e => e.getClientRects().length && !e.closest(".fa-support")).length }; })()`);
          if (!card) { bad.push(tag + ": no acknowledgement card"); continue; }
          for (const n of NUMS) if (!card.tels.includes("tel:" + n)) bad.push(`${tag}: card has no tel:${n} ${S(card.tels)}`);
          if (card.sections) bad.push(`${tag}: a reading next to the card (${card.sections} sections)`);
          const c = await counts(pg);
          for (const n of OTHERS) if (c[n].some(x => !/\(card\)/.test(x))) bad.push(`${tag}: ${n} outside the card while it shows ${S(c[n])}`);
          await continueToReading(pg, name);
          bad.push(...countProblems(await counts(pg), 0, tag + " after continue"));
          const extra = await pg.evaluate(EXTRA_HELP); if (extra.length) bad.push(tag + ": extra help element after continue " + S(extra));
        } catch (e) { bad.push(tag + ": " + String(e.message || e).slice(0, 200)); } finally { await pg.close(); }
      }
      assert(!bad.length, bad.length + " problem(s):\n       " + bad.join("\n       "));
    });

    await check("B: no echo of a name-like distress entry on the soft step, the card or the reading after it (title and address too)", async () => {
      const bad = [];
      for (const [name, typed, words, lang] of NAMES) {
        const tag = `${name} ${lang} "${typed}"`;
        const pg = await open(browser, base, name, lang, { width: W, fakeCams });
        try {
          await ask(pg, name, typed);
          const soft = await pg.evaluate(softShown), card = await pg.evaluate(cardShown);
          if (!soft && !card) { bad.push(tag + ": neither the soft step nor the card"); continue; }
          let e = await pg.evaluate(ECHO(words)); if (e.length) bad.push(`${tag}: echoed on the ${soft ? "soft step" : "card"} ${S(e)}`);
          if (soft) {
            await answerSoft(pg, name, "go");
            e = await pg.evaluate(ECHO(words)); if (e.length) bad.push(`${tag}: echoed in the reading after 'just the reading' ${S(e)}`);
          } else {
            await continueToReading(pg, name);
            e = await pg.evaluate(ECHO(words)); if (e.length) bad.push(`${tag}: echoed in the reading after continue ${S(e)}`);
          }
        } catch (x) { bad.push(tag + ": " + String(x.message || x).slice(0, 200)); } finally { await pg.close(); }
      }
      assert(!bad.length, bad.length + " problem(s):\n       " + bad.join("\n       "));
    });

    await check("C0: control: zodiac in the normal state shows the free guidance panel (TH), so C can see it", async () => {
      const pg = await open(browser, base, "zodiac", "th", { init: INIT_NORMAL, width: W });
      try {
        await ask(pg, "zodiac", "");
        await pg.waitFor("[...document.querySelectorAll('.lq-merit')].some(e => e.getClientRects().length)", 8000).catch(() => {});
        const r = await pg.evaluate(FORBIDDEN("th"));
        assert(r.sel.some(s => s.startsWith(".lq-merit")), "the guidance panel is not visible in the normal state: " + S(r));
      } finally { await pg.close(); }
    });

    for (const lang of LANGS) {
      await check(`C: ${lang}: calm tab (zodiac, horoscope, luckycolor, fortune, planner, tarot, bazi, faceread, report) and crisis state (tarot card, then continue): no remedy, guidance panel, price, paid or straight content`, async () => {
        const bad = [];
        for (const name of ["zodiac", "horoscope", "luckycolor", "fortune", "planner", "tarot", "bazi", "faceread", "report"]) {
          const pg = await open(browser, base, name, lang, { init: initFor(name, INIT), width: W, fakeCams });
          try {
            await ask(pg, name, "");
            await sleep(1500); // the merit panel loads from the stub server
            const r = await pg.evaluate(FORBIDDEN(lang));
            if (r.sel.length) bad.push(`${name} calm: ${S(r.sel)}`);
            if (r.word) bad.push(`${name} calm: forbidden wording "${r.word}"`);
          } catch (e) { bad.push(name + ": " + String(e.message || e).slice(0, 200)); } finally { await pg.close(); }
        }
        const CRISIS = { th: "อยากตายจริงๆ ไม่ไหวแล้ว", en: "I want to die tonight", zh: "我真的不想活了" };
        const pg = await open(browser, base, "tarot", lang, { init: INIT_NORMAL, width: W });
        try {
          await ask(pg, "tarot", CRISIS[lang]);
          let r = await pg.evaluate(FORBIDDEN(lang));
          if (r.sel.length || r.word) bad.push(`tarot crisis card: ${S(r)}`);
          await continueToReading(pg, "tarot"); await sleep(1500);
          r = await pg.evaluate(FORBIDDEN(lang));
          if (r.sel.length || r.word) bad.push(`tarot after continue: ${S(r)}`);
        } catch (e) { bad.push("tarot crisis: " + String(e.message || e).slice(0, 200)); } finally { await pg.close(); }
        assert(!bad.length, bad.length + " problem(s):\n       " + bad.join("\n       "));
      });
    }

    await check("D: calm state: the top 1323 button is prominent, in the first screen, one tap reaches tel:1323, and stays in view while the reading shows (TH / EN / ZH)", async () => {
      const bad = [];
      for (const lang of LANGS) for (const name of ["dream", "zodiac", "fortune", "report", "tarot"]) {
        const tag = `${name} ${lang}`;
        let normal = null;
        let pg = await open(browser, base, name, lang, { width: W });
        try { normal = await pg.evaluate(TOP_BTN); } finally { await pg.close(); }
        pg = await open(browser, base, name, lang, { init: initFor(name, INIT), width: W, fakeCams });
        try {
          await pg.evaluate("window.scrollTo(0, 0)"); await sleep(200);
          const b = await pg.evaluate(TOP_BTN);
          if (!b) { bad.push(tag + ": no visible 1323 button in #lqHelpTop"); continue; }
          if (b.h < 52) bad.push(`${tag}: button ${b.h.toFixed(1)} px tall (want ≥ 52)`);
          if (b.font < 18) bad.push(`${tag}: number ${b.font} px (want ≥ 18)`);
          if (b.contrast < 7) bad.push(`${tag}: contrast ${b.contrast.toFixed(2)}:1 (want ≥ 7)`);
          if (normal && b.w * b.h < 1.3 * normal.w * normal.h) bad.push(`${tag}: not larger than in the normal state (${Math.round(b.w)}×${Math.round(b.h)} vs ${Math.round(normal.w)}×${Math.round(normal.h)})`);
          if (b.top < 0 || b.bottom > b.vh || b.left < -0.5 || b.right > b.vw + 0.5) bad.push(`${tag}: not in the first screen ${S(b)}`);
          if (b.covered) bad.push(`${tag}: covered by ${b.hit}`);
          await pg.evaluate(`window.__tap = null; window.addEventListener("click", e => { const a = e.target && e.target.closest && e.target.closest("a[href]");
            window.__tap = { href: a ? a.getAttribute("href") : null, prevented: e.defaultPrevented }; e.preventDefault(); }, { once: true });`);
          await pg.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
          const pt = [{ x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 }];
          await pg.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt });
          await pg.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
          await sleep(300);
          const t = await pg.evaluate("window.__tap");
          if (!t || t.href !== "tel:1323" || t.prevented) bad.push(`${tag}: one tap result ${S(t)}`);
          if (!NO_READING.includes(name)) {
            await ask(pg, name, "");
            const v = await pg.evaluate(TOP_IN_VIEW);
            if (!v.length || !v.every(Boolean)) bad.push(`${tag}: the top 1323 button is not in view (and uncovered) while the reading shows ${S(v)}`);
          }
        } catch (e) { bad.push(tag + ": " + String(e.message || e).slice(0, 200)); } finally { await pg.close(); }
      }
      assert(!bad.length, bad.length + " problem(s):\n       " + bad.join("\n       "));
    });
  } finally {
    await browser.close();
  }
}

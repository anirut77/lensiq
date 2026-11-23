// tests/e2e/fortune-states.e2e.mjs — acceptance criterion E of docs/acceptance/fortune-pages.md: bad or missing input, crash guard,
// empty draw history, per page and per item (README: "Each state has its own plain message in the page language, and nothing
// stays busy"). Every page is opened fresh (own browser context, empty storage) in TH, EN and ZH (lq-lang before load).
//   1. crash guard: window.LQCrashGuard is an object after load (fortune.html and luckycolor.html load lensiq-crashguard.js themselves)
//   2. bad input: the page's own invalid or empty value is submitted; a visible, non-empty message appears in the page language
//      (TH: Thai letters; EN: Latin, no Thai; ZH: CJK, no Thai), no reading (.fa-section) is shown, no [aria-busy=true] is
//      left after 3 s and the main action control is enabled again. Pages with nothing to validate are listed in NO_INPUT.
//   3. empty / no data yet: on a fresh load no reading and no busy state are shown, the main action control is visible and
//      enabled, and every on-device history box (#…Stats) shows its empty-state text in the page language.
//   4. question field (tarot #trQuestion, iching #icQuestion; review 2026-11-23, row E): blank, whitespace-only and a 140-character
//      question (the max: 141 characters are typed with Input.insertText and maxlength must keep 140) in TH, EN and ZH. Each
//      state gives a defined, plain outcome in the page language: the draw goes on to a reading (.fa-section shown), the result
//      line (#trResMeta / #icResMeta) is in the page language and says it is a general reading when no question was typed
//      (TH "ไม่ได้พิมพ์คำถาม", EN "No question", ZH "未输入问题") or shows the question line (TH คำถาม / EN Question / ZH 问题) for
//      the 140-character one; nothing stays busy 3 s after the reading appears; no crisis state (data-lq-crisis) and no support
//      box. FIXED (locked in evals-locks/fortune-90.sha256, field copy ~/LENSIQ-field/evals/fortune-90/e-states/) before the fix.
// Never types crisis phrases (the crisis net has its own suites); the questions below are neutral and pass the crisis check.
import { assert } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const LANGS = ["th", "en", "zh"];
const HTML_LANG = { th: "th", en: "en", zh: "zh-Hans" };
const langInit = l => `try { localStorage.setItem("lq-lang", ${JSON.stringify(l)}); } catch (e) {}`;
const camDeny = `(() => { const md = navigator.mediaDevices; if (!md) return;
  md.getUserMedia = () => Promise.reject(Object.assign(new Error("denied"), { name: "NotAllowedError" })); })();`;
const detNone = `(() => { window.__LQ_FAKE_CAMS = { n: 1, mode: "ok" }; window.__LQ_FAKE_DET = () => []; })();`;
const setVal = (id, v) => `(() => { const e = document.getElementById(${JSON.stringify(id)}); e.value = ${JSON.stringify(v)};
  e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); })()`;
const click = sel => `document.querySelector(${JSON.stringify(sel)}).click()`;
const submit = id => `document.getElementById(${JSON.stringify(id)}).requestSubmit()`;
const SUB = id => `#${id} [type=submit]`;

/** shared probe: visibility, language and busy facts of the page (runs in the page) */
const PROBE = `(() => {
  const vis = e => { if (!e || !e.isConnected || e.closest("[hidden]")) return false; const cs = getComputedStyle(e);
    if (cs.display === "none" || cs.visibility === "hidden") return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  window.__lqVis = vis;
  return true;
})()`;
const lang = (t, l) => {
  const th = /[฀-๿]/.test(t), la = /[A-Za-z]/.test(t), zh = /[一-鿿]/.test(t);
  if (l === "th") return th ? "" : "no Thai letters";
  if (l === "en") return th ? "has Thai" : la ? "" : "no Latin letters";
  return th ? "has Thai" : zh ? "" : "no Chinese characters";
};

// page → { main: selector of the main action control, bad(page): enter and submit the bad input, msg: selector of its message,
//          q: query string, init: extra init scripts }
const lc = { main: SUB("lcForm"), msg: "#lcMsg",
  bad: async p => { await p.evaluate(setVal("lcDay", "1")); await p.evaluate(setVal("lcMonth", "1")); await p.evaluate(setVal("lcYear", "")); await p.evaluate(click(SUB("lcForm"))); } };
const PAGES = [
  { page: "fortune.html", main: 'a[href*="horoscope.html"]', hub: true },
  { page: "palm.html", q: "?cpu&fakedet", cam: true, main: "#plStartCam", msg: "#plEngine",
    bad: async p => {
      await p.waitFor(`!!(window.__palm && document.getElementById("plEngine").classList.contains("ok"))`, 10000);
      await p.evaluate(click("#plStartCam"));
      await p.waitFor(`document.querySelector("#plCam.live") && !document.getElementById("plSnap").hidden`, 10000);
      await sleep(600);
      await p.evaluate(click("#plSnap"));
      await p.waitFor(`document.getElementById("plEngine").classList.contains("err")`, 20000);
    }, mainAfter: "#plSnap" },
  { page: "horoscope.html", main: "#hsGo", msg: "#hsErr",
    bad: async p => { await p.evaluate(setVal("hsDay", "31")); await p.evaluate(setVal("hsMonth", "2")); await p.evaluate(setVal("hsYear", "2533")); await p.evaluate(click("#hsGo")); } },
  { page: "tarot.html", main: "#trStart" },
  { page: "iching.html", main: "#icStart" },
  { page: "bazi.html", ...lc }, { page: "taksa.html", ...lc }, { page: "lek7.html", ...lc },
  { page: "numbers.html", main: "#nmGo", msg: "#nmErr",
    bad: async p => { await p.evaluate(setVal("nmPhone", "12")); await p.evaluate(click("#nmGo")); } },
  { page: "fengshui.html", main: SUB("fsKuaForm"), msg: "#fsKuaMsg", bad: async p => { await p.evaluate(click(SUB("fsKuaForm"))); } },
  // the predict button stays disabled until a symbol is chosen (dream.js renderSel): the empty form is submitted with Enter-like requestSubmit
  { page: "dream.html", main: "#drText", msg: "#drMsg", bad: async p => { await p.evaluate(submit("drForm")); } },
  { page: "zodiac.html", main: SUB("zdForm"), msg: "#zdMsg", bad: async p => { await p.evaluate(click(SUB("zdForm"))); } },
  { page: "astro.html", main: SUB("asForm"), msg: "#asMsg", bad: async p => { await p.evaluate(click(SUB("asForm"))); } },
  { page: "lifegraph.html", ...lc },
  { page: "luckycolor.html", main: "#startCam", msg: "#engine", init: [camDeny],
    bad: async p => { await p.evaluate(click("#startCam")); await p.waitFor(`document.getElementById("engine").textContent.trim().length > 0`, 8000); } },
  { page: "report.html", main: "#rpGo", msg: "#rpMsg",
    bad: async p => { await p.evaluate(setVal("rpAYear", "")); await p.evaluate(click("#rpGo")); } }
];
// pages with nothing to validate (evidence in the report of this suite): the question is optional and capped by maxlength
const NO_INPUT = {
  "fortune.html": "hub: links only, no form or input field",
  "tarot.html": "tarot.html:107 #trQuestion optional (maxlength 140); the reveal button only appears after all cards are picked (tarot.js:464)",
  "iching.html": "iching.html:99 #icQuestion optional (maxlength 140); #icStart has no input to validate"
};

// 4. the question states of the two pages with an optional question
const longQ = u => { let s = ""; while (s.length < 141) s += u; return s.slice(0, 141); };
const QTEXT = { th: longQ("ช่วงนี้ควรโฟกัสเรื่องงานหรือเรื่องเรียนก่อนดี และควรวางแผนสัปดาห์หน้าอย่างไร "),
  en: longQ("Should I focus on work or study first this month, and how can I plan the next few weeks at a calm, steady pace? "),
  zh: longQ("这个月我应该先专注工作还是学习，怎样平静地安排接下来的几周？") };
const NOQ = { th: "ไม่ได้พิมพ์คำถาม", en: "No question", zh: "未输入问题" }, QLABEL = { th: "คำถาม", en: "Question", zh: "问题" };
const QSTATES = ["blank", "spaces", "max140"];
const QPAGES = [
  { page: "tarot.html", field: "trQuestion", result: "#trResult", meta: "#trResMeta", support: "#trSupport",
    draw: async p => {
      await p.evaluate(click("#trStart"));
      await p.waitFor(`!document.getElementById("trPick").hidden`, 8000);
      await p.evaluate(click("#trAuto"));
      await p.waitFor(`!document.getElementById("trReveal").hidden`, 15000);
      await p.evaluate(click("#trReveal"));
    } },
  { page: "iching.html", field: "icQuestion", result: "#icResult", meta: "#icResMeta", support: "#icSupport",
    draw: async p => { await p.evaluate(click("#icStart")); await sleep(300); await p.evaluate(click("#icAuto")); } }
];
async function runQuestion(browser, base, Q, l, state) {
  const probs = [];
  const p = await browser.newPage(null, { initScripts: [langInit(l)], isolated: true });
  try {
    await p.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await p.goto(`${base}/${Q.page}`);
    await p.waitFor(`document.documentElement.lang === ${JSON.stringify(HTML_LANG[l])}`, 8000);
    await sleep(500);
    if (state === "spaces") await p.evaluate(setVal(Q.field, "   \n  "));
    if (state === "max140") {
      await p.evaluate(`document.getElementById(${JSON.stringify(Q.field)}).focus()`);
      await p.send("Input.insertText", { text: QTEXT[l] });
      const v = await p.evaluate(`document.getElementById(${JSON.stringify(Q.field)}).value`);
      if (v.length !== 140 || v !== QTEXT[l].slice(0, 140)) probs.push(`${l}/${state}: typed 141 characters, field holds ${v.length} (maxlength 140 not kept)`);
    }
    await Q.draw(p);
    try { await p.waitFor(`(() => { const r = document.querySelector(${JSON.stringify(Q.result)}); return r && !r.hidden && r.querySelectorAll(".fa-section").length > 0; })()`, 20000); }
    catch (e) { probs.push(`${l}/${state}: no reading within 20 s (${String(e.message || e).slice(0, 160)})`); }
    try { await p.waitFor(`![...document.querySelectorAll('[aria-busy="true"]')].length`, 3000); } catch { /* reported below */ }
    await p.evaluate(PROBE);
    const f = await p.evaluate((meta, support) => {
      const vis = window.__lqVis, m = document.querySelector(meta), s = document.querySelector(support);
      return { meta: m ? m.innerText.trim() : "", metaVis: vis(m), busy: [...document.querySelectorAll('[aria-busy="true"]')].filter(vis).map(e => e.id || e.className || e.tagName),
        crisis: document.documentElement.getAttribute("data-lq-crisis") === "1", support: !!(s && vis(s)) };
    }, Q.meta, Q.support);
    if (!f.meta || !f.metaVis) probs.push(`${l}/${state}: result line ${Q.meta} not shown`);
    const metaLang = lang(f.meta, l);
    if (metaLang) probs.push(`${l}/${state}: ${Q.meta} "${f.meta.slice(0, 80)}" ${metaLang}`);
    if (state === "max140") { if (f.meta.indexOf(QLABEL[l]) < 0) probs.push(`${l}/${state}: no question line in "${f.meta.slice(0, 120)}"`); }
    else if (f.meta.indexOf(NOQ[l]) < 0) probs.push(`${l}/${state}: no "general reading" line (${NOQ[l]}) in "${f.meta.slice(0, 120)}"`);
    if (f.busy.length) probs.push(`${l}/${state}: still busy 3 s after the reading: ${f.busy.join(", ")}`);
    if (f.crisis || f.support) probs.push(`${l}/${state}: crisis state or support box on a neutral question`);
    return { probs, meta: f.meta.replace(/\s+/g, " ").slice(0, 70) };
  } finally { await p.close(); }
}

/** facts after a fresh load or after the bad input: readings shown, busy elements, main control, history boxes */
async function facts(p, main) {
  await p.evaluate(PROBE);
  return p.evaluate(m => {
    const vis = window.__lqVis;
    const secs = [...document.querySelectorAll(".fa-section")].filter(vis).length;
    const busy = [...document.querySelectorAll('[aria-busy="true"]')].filter(vis).map(e => e.id || e.className || e.tagName);
    const all = [...document.querySelectorAll(m)], el = all.find(vis) || all[0]; // first visible match
    // a history box inside a closed <details> is opened first (the user's tap), then it must be visible
    const hist = [...document.querySelectorAll('div[id$="Stats"]')].map(b => { const d = b.closest("details:not([open])"); if (d) d.open = true;
      const r = { id: b.id, text: b.textContent.trim(), shown: vis(b), folded: !!d }; if (d) d.open = false; return r; });
    return { secs, busy, main: { found: !!el, vis: vis(el), disabled: !!(el && (el.disabled || el.getAttribute("aria-disabled") === "true")) }, hist };
  }, main);
}

async function msgOf(p, sel) {
  await p.evaluate(PROBE);
  return p.evaluate(s => { const e = document.querySelector(s); return { text: e ? e.textContent.trim() : "", vis: window.__lqVis(e) }; }, sel);
}

/** fresh load in one language → { guard, empty: [problems], bad: [problems] } */
async function runOne(browser, base, fakeCams, P, l) {
  const out = { guard: null, empty: [], bad: [] };
  const init = [langInit(l)].concat(P.cam ? [fakeCams, detNone] : [], P.init || []);
  const p = await browser.newPage(null, { initScripts: init, isolated: true });
  try {
    await p.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await p.goto(`${base}/${P.page}${P.q || ""}`);
    await p.waitFor(`document.documentElement.lang === ${JSON.stringify(HTML_LANG[l])}`, 8000);
    await sleep(700);
    out.guard = await p.evaluate(`typeof window.LQCrashGuard`);
    // 3. empty / no data yet
    try { await p.waitFor(`![...document.querySelectorAll('[aria-busy="true"]')].length`, 3000); } catch { /* reported by facts() */ }
    const f = await facts(p, P.main);
    if (f.secs) out.empty.push(`${l}: ${f.secs} reading section(s) on a fresh load`);
    if (f.busy.length) out.empty.push(`${l}: busy on a fresh load: ${f.busy.join(", ")}`);
    if (!f.main.found || !f.main.vis || f.main.disabled) out.empty.push(`${l}: main control ${P.main} ${JSON.stringify(f.main)}`);
    out.hist = f.hist.map(h => `${l} #${h.id}: "${h.text.slice(0, 30)}"`);
    for (const h of f.hist) {
      if (!h.text) out.empty.push(`${l}: #${h.id} history box is empty (no empty-state text)`);
      else if (!h.shown) out.empty.push(`${l}: #${h.id} empty-state text is not shown`);
      else if (lang(h.text, l)) out.empty.push(`${l}: #${h.id} "${h.text.slice(0, 60)}" ${lang(h.text, l)}`);
    }
    // 2. bad or missing input
    if (P.bad) {
      try { await P.bad(p); } catch (e) { out.bad.push(`${l}: could not enter the bad input: ${String(e.message || e).slice(0, 200)}`); return out; }
      await sleep(400);
      const m = await msgOf(p, P.msg);
      if (!m.text || !m.vis) out.bad.push(`${l}: no visible message in ${P.msg} (${JSON.stringify(m)})`);
      else if (lang(m.text, l)) out.bad.push(`${l}: ${P.msg} "${m.text.slice(0, 80)}" ${lang(m.text, l)}`);
      try { await p.waitFor(`![...document.querySelectorAll('[aria-busy="true"]')].length`, 3000); } catch { /* reported below */ }
      const g = await facts(p, P.mainAfter || P.main);
      if (g.secs) out.bad.push(`${l}: ${g.secs} reading section(s) shown after bad input`);
      if (g.busy.length) out.bad.push(`${l}: still busy 3 s after bad input: ${g.busy.join(", ")}`);
      if (!g.main.found || !g.main.vis || g.main.disabled) out.bad.push(`${l}: main control after bad input ${JSON.stringify(g.main)}`);
      if (out.bad.length === 0) out.badMsg = (out.badMsg || []).concat(`${l}: "${m.text.slice(0, 50)}"`);
    }
  } finally { await p.close(); }
  return out;
}

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    for (const P of PAGES) {
      const res = {};
      for (const l of LANGS) {
        try { res[l] = await runOne(browser, base, fakeCams, P, l); }
        catch (e) { res[l] = { guard: null, crash: String(e.message || e).slice(0, 300), empty: [], bad: [] }; }
      }
      const crashed = LANGS.filter(l => res[l].crash).map(l => `${l}: ${res[l].crash}`);
      await check(`states: ${P.page} crash guard loaded (window.LQCrashGuard)`, async () => {
        assert(!crashed.length, crashed.join(" | "));
        const bad = LANGS.filter(l => res[l].guard !== "object");
        assert(!bad.length, `typeof LQCrashGuard: ${bad.map(l => l + "=" + res[l].guard).join(", ")}`);
      });
      if (P.bad) {
        await check(`states: ${P.page} bad or missing input → plain message in TH/EN/ZH, no reading, nothing busy`, async () => {
          const probs = crashed.concat(...LANGS.map(l => res[l].bad));
          assert(!probs.length, probs.join(" | "));
          console.log(`       ${LANGS.map(l => (res[l].badMsg || []).join("")).join("  ")}`);
        });
      } else if (!QPAGES.some(Q => Q.page === P.page)) console.log(`  note ${P.page}: no invalid input state — ${NO_INPUT[P.page]}`);
      await check(`states: ${P.page} fresh load → no stale reading, nothing busy, main control ready, history empty text in TH/EN/ZH`, async () => {
        const probs = crashed.concat(...LANGS.map(l => res[l].empty));
        assert(!probs.length, probs.join(" | "));
        const seen = LANGS.flatMap(l => res[l].hist || []);
        if (seen.length) console.log(`       ${seen.join("  ")}`);
      });
    }
    for (const Q of QPAGES) {
      await check(`states: ${Q.page} question blank / spaces / 140 characters (141 typed) → reading with a plain line in TH/EN/ZH, nothing busy`, async () => {
        const probs = [], seen = [];
        for (const l of LANGS) for (const s of QSTATES) {
          try { const r = await runQuestion(browser, base, Q, l, s); probs.push(...r.probs); seen.push(`${l}/${s}: "${r.meta}"`); }
          catch (e) { probs.push(`${l}/${s}: ${String(e.message || e).slice(0, 200)}`); }
        }
        assert(!probs.length, probs.join(" | "));
        console.log(`       ${seen.join("\n       ")}`);
      });
    }
  } finally { await browser.close(); }
}

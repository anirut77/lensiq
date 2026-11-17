// tests/e2e/crisis-v3-pre.e2e.mjs — FIXED TEST SET "crisis-v3", decision 84 (both options built; owner chooses from the images).
// Locked BEFORE the option ข product code (evals-locks/crisis-v3.sha256, tag `pre-lock`; ledger docs/CRISIS-V3-RELOCKS.md).
//   ก (shipped default, window.LENSIQ_CRISIS_PRELINE false in lensiq-config.js): the closing line at the end only (crisis-v3 a-d).
//   ข (the switch on): additionally ONE short warm line with the single tel:1323 button BEFORE the reading, shown ONLY when the
//      typed text is an explicit plan (narrow listed set, TH / EN / ZH); the reading still continues; nothing says "flagged".
// Per page with a free-text field (dream, tarot, iching, horoscope, numbers, report, faceread, palm; compat / petread once merged)
// in the page language of this file's part (PRE_LANG; -pre-en / -pre-zh run the other two) at 393 px:
//   P1 switch ข + plan phrase: exactly one .lq-crisis-pre, visible, before the first reading section (document order and on
//      screen), not sticky / fixed, one link only (tel:1323, >= 44 x 44 px), a short warm line (<= 140 characters TH / EN, <= 60
//      ZH; no Thai in EN / ZH), no "flagged" wording, no other number; then, with the pre-line taken out, the locked crisis-v3
//      judge (reading continues gently, closing line at the end, no card / sales / share / print, one number), no echo, no
//      analytics.
//   P2 shipped switch (ก) + the same plan phrase: no .lq-crisis-pre; the crisis-v3 judge passes as is.
//   P3 switch ข + a crisis phrase that is not a plan (kit PHRASE): no .lq-crisis-pre; the judge passes.
//   P4 switch ข + no phrase (an ordinary reading): no .lq-crisis-pre and no closing line; the crisis state is not set.
import { PAGES, PHRASE, FLAGGED, OTHER_NUMS, S, assert, after, baseline, echo, events, exists, judge, open, FACTS } from "./crisis-v3-kit.mjs";

export const PRE_LANG = "th";
/** explicit-plan phrases used in the browser (fit the 24-character nickname boxes) */
export const PLAN = { th: "คืนนี้จะจบชีวิต", en: "I'll kill myself tonight", zh: "今晚就结束生命" };
const WIDTH = 393;
/** the switch ข, held against lensiq-config.js (which only sets it when it is not already true) */
const SWITCH_B = `Object.defineProperty(window, "LENSIQ_CRISIS_PRELINE", { configurable: true, get: () => true, set: () => {} });`;

const PRE_FACTS = lang => `(() => {
  const vis = e => { if (!e || !e.isConnected) return false; if (e.checkVisibility && !e.checkVisibility({ visibilityProperty: true, opacityProperty: true })) return false;
    const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const pres = [...document.querySelectorAll(".lq-crisis-pre")], shown = pres.filter(vis), p = shown[0] || null;
  const first = [...document.querySelectorAll("main .fa-section")].filter(vis)[0] || null;
  const box = a => { const b = a.getBoundingClientRect(); return { h: a.getAttribute("href"), w: Math.round(b.width), ht: Math.round(b.height) }; };
  const links = p ? [...p.querySelectorAll("a[href]")].filter(vis).map(box) : [];
  const pinned = e => { for (let x = e; x && x.nodeType === 1; x = x.parentElement) { const q = getComputedStyle(x).position; if (q === "fixed" || q === "sticky") return true; } return false; };
  const warm = p ? (p.querySelector(".lq-crisis-pre-warm") || { innerText: "" }).innerText.trim() : "";
  return { all: pres.length, shown: shown.length, links, warm, text: p ? p.innerText : "",
    before: !!p && !!first && !!(p.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING) && p.getBoundingClientRect().bottom <= first.getBoundingClientRect().top + 1,
    pinned: !!p && pinned(p), crisis: document.documentElement.getAttribute("data-lq-crisis") === "1",
    closing: [...document.querySelectorAll("main .lq-helpline")].filter(vis).length,
    flagged: !!p && ${FLAGGED[lang].toString()}.test(p.innerText), other: !!p && ${OTHER_NUMS.toString()}.test(p.innerText) };
})()`;
const DROP_PRE = `(() => { document.querySelectorAll(".lq-crisis-pre").forEach(e => e.remove()); return true; })()`;

/** one case: open, read with `typed`, return the problems */
async function runCase(browser, base, p, lang, { typed, switchB, expectPre, fakeCams, crisis = true }) {
  const cfg = PAGES[p], where = `${p} ${lang} ${WIDTH}px ${switchB ? "ข" : "ก"} ${typed == null ? "(no phrase)" : S(typed)}`;
  const page = await open(browser, base, p, { lang, width: WIDTH, fakeCams });
  const bad = [];
  try {
    if (switchB) { await page.evaluate(SWITCH_B); }
    const before = await baseline(page);
    await cfg.read(page, typed);
    await new Promise(r => setTimeout(r, 900));
    const pf = await page.evaluate(PRE_FACTS(lang));
    if (expectPre) {
      if (pf.all !== 1 || pf.shown !== 1) bad.push(`${where}: pre-line count ${pf.all} (shown ${pf.shown}), want exactly 1`);
      if (!pf.before) bad.push(`${where}: pre-line not before the first section of the reading`);
      if (pf.pinned) bad.push(`${where}: pre-line is sticky / fixed`);
      if (S(pf.links.map(l => l.h)) !== S(["tel:1323"])) bad.push(`${where}: pre-line links ${S(pf.links)} (want one tel:1323)`);
      else if (pf.links[0].w < 44 || pf.links[0].ht < 44) bad.push(`${where}: pre-line 1323 button ${pf.links[0].w}x${pf.links[0].ht}`);
      if (!pf.warm || pf.warm.length > (lang === "zh" ? 60 : 140)) bad.push(`${where}: pre-line warm line ${S(pf.warm)}`);
      if (lang !== "th" && /[฀-๿]/.test(pf.text)) bad.push(`${where}: Thai in the ${lang} pre-line`);
      if (pf.flagged) bad.push(`${where}: pre-line says the person was flagged`);
      if (pf.other) bad.push(`${where}: another help number in the pre-line`);
    } else if (pf.all) bad.push(`${where}: a pre-line is shown (${pf.all}); want none`);
    if (crisis) {
      await page.evaluate(DROP_PRE);
      const f = await page.evaluate(FACTS(lang, cfg.root));
      bad.push(...judge(f, where));
      const e = echo(before, await after(page), typed);
      if (e.length) bad.push(`${where}: echo ${S(e)}`);
      const ev = await events(page);
      if (ev.length) bad.push(`${where}: e: analytics sent ${S(ev)}`);
    } else {
      if (pf.crisis) bad.push(`${where}: an ordinary reading set the crisis state`);
      if (pf.closing) bad.push(`${where}: an ordinary reading shows the closing line (${pf.closing})`);
    }
  } catch (err) { bad.push(`${where}: ${String(err.message || err).slice(0, 160)}`); } finally { await page.close(); }
  return bad;
}

export async function partPre({ base, launch, check, fakeCams }, lang) {
  const browser = await launch();
  try {
    for (const p of Object.keys(PAGES).filter(k => PAGES[k].field)) {
      const cfg = PAGES[p];
      if (cfg.optional && !(await exists(base, p))) { await check(`${p}: not on this branch yet (runs once merged)`, async () => {}); continue; }
      await check(`${p} [${lang}] decision 84: ข shows one warm 1323 line before the reading only for a plan phrase; ก (shipped) never; the reading goes on`, async () => {
        const bad = [];
        bad.push(...await runCase(browser, base, p, lang, { typed: PLAN[lang], switchB: true, expectPre: true, fakeCams }));
        bad.push(...await runCase(browser, base, p, lang, { typed: PLAN[lang], switchB: false, expectPre: false, fakeCams }));
        bad.push(...await runCase(browser, base, p, lang, { typed: PHRASE[lang], switchB: true, expectPre: false, fakeCams }));
        bad.push(...await runCase(browser, base, p, lang, { typed: null, switchB: true, expectPre: false, fakeCams, crisis: false }));
        assert(!bad.length, bad.length + " problem(s):\n      " + bad.join("\n      "));
      });
    }
  } finally { await browser.close(); }
}
export default ctx => partPre(ctx, PRE_LANG);

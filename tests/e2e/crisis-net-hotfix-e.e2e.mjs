// tests/e2e/crisis-net-hotfix-e.e2e.mjs — FIXED TEST SET "crisis-net-hotfix" ROUND 2 (locked 2026-11-17 BEFORE the round-2 fix,
// on branch crisis-net-hotfix 5061f53 + reviewer lock e32a7b2). Defects from the independent review of 5061f53:
//   E1 palm: the palm map (#plEdit with #plEditCanvas, #plFit, #plEditTitle, #plEditCap) stays visible next to the card;
//   E2 tarot / iching: the crisis flag does not hold: an ordinary question after the card hides the card and starts the
//      shuffle / coin step; after a reading the drawn-card board and "Report a problem with this reading" stay above the card;
//   E3 tarot daily card (#trDailyText, #trDailyShare), siamsee stick number (#ssFall) and the iching Daily tab (#icDaily,
//      #icDayShare) show readings / share in the crisis state;
//   E4 the report dialog (lensiq-report.js note textarea) is an uncovered free-text input: a crisis phrase gives no card and is
//      saved into localStorage "lq-report-log";
//   E5 (second reviewer) fortune-crisis.js blocked / failing to load: the early net shows no card.
// Owner order 2026-11-16 (a) the card replaces the whole result area, (b) the crisis check runs before validation on every
// input, (c) every free-text input is covered; once the crisis flag is set it holds for the tab.
// Every check runs in TH / EN / ZH page language with the phrase of the same language (kit PHRASE, existing locked lists) at
// 375 and 393 px, separate page loads; assertCard = the kit's (card with 1323 on the first screen, no widget, no echo).
// RE-LOCK 2026-11-17 (crisis v3, owner decision 2026-11-17; merge of main 02fdd69 into crisis-v3; ledger docs/CRISIS-V3-RELOCKS.md):
// rule a replaces "the card": assertCard is the v3 kit check (crisis state set by the action, no card, no sales / share /
// print, one number, no echo). E2: after a crisis question an ordinary question keeps the crisis state and shows no card (the
// shuffle / coin step goes on, gently). E3: the wait for the card becomes the wait for the crisis state; "no daily reading,
// siamsee or share in the crisis state" is kept unchanged. E5: the 44 px tel:1323 is the closing line's (not the top bar's),
// still required when fortune-crisis.js fails to load.
import { PHRASE, WIDTHS, GENERIC, assertCard, baseline, click, open, setVal, sleep, submit } from "./crisis-net-hotfix-kit.mjs";
import { assert } from "./cdp.mjs";

const LANGS = ["th", "en", "zh"];
const ORDINARY = { th: "งานใหม่จะดีไหม", en: "Will the new job go well?", zh: "新工作会顺利吗" };
const S = JSON.stringify;
const VIS = `const vis = e => { for (let x = e; x && x.nodeType === 1; x = x.parentElement) { if (x.hidden) return false; const cs = getComputedStyle(x);
  if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return false; } const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };`;
/** visible selectors among the list (with text, or an image / canvas / svg) */
const shownOf = sels => `(() => { ${VIS} return ${S(sels)}.filter(s => [...document.querySelectorAll(s)].some(e => vis(e) && (e.textContent.trim() || e.matches("canvas, svg, img") || e.querySelector("canvas, svg, img")))); })()`;

const HAND = { x: 0.35, y: 0.18, w: 0.3, h: 0.6, score: 0.95, side: "right" };
const det = `(() => { window.__LQ_FAKE_CAMS = { n: 1, mode: "ok" }; window.__dets = []; window.__LQ_FAKE_DET = () => window.__dets.map(d => Object.assign({}, d)); })();`;
const PL = GENERIC.concat(["#plResTitle", "#plSideBadge", "#plResCanvas", "#plElement", "#plReadTitle", "#plSrc", "#plCompare", "#plLines", "#plMountEst",
  "#plFingers", "#plExtras", "#plCardImg", "#plOverlay", "#plEdit", "#plEditCanvas", "#plFit", "#plEditTitle", "#plEditCap", ".lq-rp-wrap"]);
const TR = GENERIC.concat(["#trPick", "#trBoard", "#trResult", "#trSynth", "#trReadings", "#trCardImg", "#ssResult", ".lq-rp-wrap", ".lq-rp-btn"]);
const IC = GENERIC.concat(["#icStage", "#icResult", "#icHexes", "#icGist", "#icCardImg", ".lq-rp-wrap", ".lq-rp-btn"]);
const NM = GENERIC.concat(["#nmResTitle", "#nmResKind", "#nmResNum", "#nmRing", "#nmScoreWord", "#nmBreak", "#nmStrip", "#nmPairsBlock", "#nmCardImg"]);

const sections = (n, scope) => `document.querySelectorAll(${S(scope + " .fa-section")}).length >= ${n}`;
async function tarotReading(page) {
  await page.evaluate(() => { document.querySelector('input[value="three"]').click(); document.querySelector('input[value="love"]').click(); document.getElementById("trStart").click(); });
  await sleep(600); await page.evaluate(click("#trAuto")); await sleep(900); await page.evaluate(click("#trReveal"));
  await page.waitFor(sections(3, "#trResult"), 25000);
}
async function ichingReading(page) {
  await page.evaluate(() => { document.getElementById("icStart").click(); document.getElementById("icAuto").click(); });
  await page.waitFor(sections(3, "#icResult"), 20000);
}
/** every (language, width) case runs; failures are collected, then the check fails if any */
async function each(check, name, fn) {
  await check(name, async () => {
    const fails = [];
    let n = 0;
    for (const lang of LANGS) for (const width of WIDTHS) {
      n++;
      const label = `${name.split(":")[0]} [ui ${lang}, phrase ${lang}, ${width}px]`;
      try { await fn({ lang, width, phrase: PHRASE[lang], label }); } catch (e) { fails.push(String(e.message || e).replace(/^assertion failed: /, "")); }
    }
    console.log(`    ${name.split(":")[0]}: ${n - fails.length}/${n} cases pass`);
    assert(!fails.length, fails.length + "/" + n + " cases fail:\n      " + fails.join("\n      "));
  });
}

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    /* ---------------- E1 palm map ---------------- */
    const plOpen = async o => {
      const page = await open(browser, base, "palm.html?cpu&fakedet", Object.assign({ initScripts: [fakeCams, det] }, o));
      await page.waitFor(`!!(window.__palm && document.getElementById("plEngine").classList.contains("ok"))`, 10000);
      await page.evaluate(click("#plStartCam"));
      await page.waitFor(`document.querySelector("#plCam.live") && !document.getElementById("plSnap").hidden`, 8000);
      await page.evaluate(d => { window.__dets = d; }, [HAND]);
      await sleep(300);
      await page.evaluate(click("#plSnap"));
      await page.waitFor(`!document.getElementById("plEdit").hidden && !!window.__palm.S.lines && !window.__palm.S.busy`, 20000);
      return page;
    };
    await each(check, "E1 palm, nickname before the reading: the palm map (#plEdit) goes with the reading", async ({ lang, width, phrase, label }) => {
      const page = await plOpen({ lang, width });
      try {
        const before = await baseline(page);
        await page.evaluate(setVal("#plNick", phrase)); await page.evaluate(click("#plRead"));
        await assertCard(page, { label, typed: phrase, before, widgets: PL });
      } finally { await page.close(); }
    });
    await each(check, "E1 palm, nickname after the reading: the palm map (#plEdit) goes with the reading", async ({ lang, width, phrase, label }) => {
      const page = await plOpen({ lang, width });
      try {
        await page.evaluate(click("#plRead")); await page.waitFor(sections(3, "#plNarr"), 20000);
        const before = await baseline(page);
        await page.evaluate(setVal("#plNick", phrase));
        await assertCard(page, { label, typed: phrase, before, widgets: PL });
      } finally { await page.close(); }
    });

    /* ---------------- E2 tarot / iching: the flag holds; board + report button go ---------------- */
    await each(check, "E2 tarot: after a reading, crisis question -> crisis state, no card, nothing echoed (v3); then an ordinary question -> the state holds, no card", async ({ lang, width, phrase, label }) => {
      const page = await open(browser, base, "tarot.html", { width, lang });
      try {
        await tarotReading(page);
        await page.waitFor(`!!document.querySelector(".lq-rp-btn")`, 8000);
        await page.evaluate(click("#trAgain")); await sleep(300);
        const before = await baseline(page);
        await page.evaluate(setVal("#trQuestion", phrase)); await page.evaluate(submit("trSetup"));
        await assertCard(page, { label: label + " crisis", typed: phrase, before, widgets: TR });
        await page.evaluate(setVal("#trQuestion", ORDINARY[lang])); await page.evaluate(submit("trSetup"));
        await sleep(1500);
        await assertCard(page, { label: label + " ordinary after crisis", typed: phrase, before, widgets: TR });
        const r = await page.evaluate(() => ({ sup: !document.getElementById("trSupport") || document.getElementById("trSupport").hidden }));
        assert(r.sup, label + ": ordinary question after the crisis question: a card is shown (v3: none) " + JSON.stringify(r));
      } finally { await page.close(); }
    });
    await each(check, "E2 iching: after a reading, crisis question -> crisis state, no card, nothing echoed (v3); then an ordinary question -> the state holds, no card", async ({ lang, width, phrase, label }) => {
      const page = await open(browser, base, "iching.html", { width, lang });
      try {
        await ichingReading(page);
        await page.waitFor(`!!document.querySelector(".lq-rp-btn")`, 8000);
        await page.evaluate(click("#icAgain")); await sleep(300);
        const before = await baseline(page);
        await page.evaluate(setVal("#icQuestion", phrase)); await page.evaluate(click("#icStart"));
        await assertCard(page, { label: label + " crisis", typed: phrase, before, widgets: IC });
        await page.evaluate(setVal("#icQuestion", ORDINARY[lang])); await page.evaluate(click("#icStart"));
        await sleep(1500);
        await assertCard(page, { label: label + " ordinary after crisis", typed: phrase, before, widgets: IC });
        const r = await page.evaluate(() => ({ sup: !document.getElementById("icSupport") || document.getElementById("icSupport").hidden }));
        assert(r.sup, label + ": ordinary question after the crisis question: a card is shown (v3: none) " + JSON.stringify(r));
      } finally { await page.close(); }
    });

    /* ---------------- E3 daily card, siamsee, iching daily in the crisis state ---------------- */
    await each(check, "E3 tarot: in the crisis state the daily card and siamsee show no reading, number or share", async ({ lang, width, phrase, label }) => {
      const page = await open(browser, base, "tarot.html", { width, lang });
      try {
        await page.evaluate(setVal("#trQuestion", phrase)); await page.evaluate(submit("trSetup"));
        await page.waitFor(`document.documentElement.getAttribute("data-lq-crisis") === "1"`, 8000);
        await page.evaluate(click("#tabDaily")); await sleep(300);
        await page.evaluate(click("#trDailyCard")); await sleep(1200);
        const daily = await page.evaluate(shownOf(["#trDailyText dl", "#trDailyText .kws", "#trDailyText .syn-advice", "#trDailyShare", "#trDailyCardImg", "#trDailyImg"]));
        await page.evaluate(click("#tabSiamsee")); await sleep(300);
        await page.evaluate(click("#ssDraw")); await sleep(3500);
        const ss = await page.evaluate(shownOf(["#ssFall", "#ssFallNo", "#ssResult", "#ssTitle", "#ssShare", "#ssCardImg"]));
        assert(!daily.length && !ss.length, label + ": shown in the crisis state: " + daily.concat(ss).join(", "));
      } finally { await page.close(); }
    });
    await each(check, "E3 iching: in the crisis state the Daily tab shows no reading and no share", async ({ lang, width, phrase, label }) => {
      const page = await open(browser, base, "iching.html", { width, lang });
      try {
        await page.evaluate(setVal("#icQuestion", phrase)); await page.evaluate(click("#icStart"));
        await page.waitFor(`document.documentElement.getAttribute("data-lq-crisis") === "1"`, 8000);
        await page.evaluate(click("#tabDaily")); await sleep(1200);
        const shown = await page.evaluate(shownOf(["#icDaily", "#icDayShare", "#icDayImg"]));
        assert(!shown.length, label + ": shown in the crisis state: " + shown.join(", "));
      } finally { await page.close(); }
    });

    /* ---------------- E4 the report dialog's note ---------------- */
    for (const [pg, read, widgets] of [["tarot", tarotReading, TR], ["iching", ichingReading, IC]]) {
      await each(check, `E4 ${pg} report dialog: crisis phrase in the note -> nothing saved, dialog closed, crisis state, no card (v3)`, async ({ lang, width, phrase, label }) => {
        const page = await open(browser, base, pg + ".html", { width, lang });
        try {
          await read(page);
          await page.waitFor(`!!document.querySelector(".lq-rp-btn")`, 8000);
          const before = await baseline(page);
          await page.evaluate(click(".lq-rp-btn"));
          await page.waitFor(`!!document.querySelector("dialog.lq-rp textarea")`, 5000);
          await page.evaluate(setVal("dialog.lq-rp textarea", phrase));
          await sleep(300);
          // a visitor who does not wait: save on this device (third button) if the dialog is still open
          await page.evaluate(`(() => { const d = document.querySelector("dialog.lq-rp"); if (d && d.open) { const b = d.querySelectorAll(".row button")[2]; if (b) b.click(); } return true; })()`);
          await sleep(300);
          const st = await page.evaluate(`(() => { let log = ""; try { log = localStorage.getItem("lq-report-log") || ""; } catch (e) {} const d = document.querySelector("dialog.lq-rp"); return { log: log.length, open: !!(d && d.open) }; })()`);
          assert(!st.log, label + ": the report with the crisis phrase was saved (lq-report-log " + st.log + " chars)");
          assert(!st.open, label + ": the report dialog stays open");
          await assertCard(page, { label, typed: phrase, before, widgets });
        } finally { await page.close(); }
      });
    }

    /* ---------------- E5 fortune-crisis.js fails to load ---------------- */
    const openBlocked = async (path, { width, lang }) => {
      const page = await browser.newPage(null, { isolated: true });
      await page.send("Network.setBlockedURLs", { urls: ["*fortune-crisis.js*"] });
      await page.send("Emulation.setDeviceMetricsOverride", { width, height: width === 375 ? 812 : 852, deviceScaleFactor: 2, mobile: true });
      await page.goto(`${base}/${path}?lang=${lang}`);
      await page.waitFor(`document.documentElement.lang === ${S(lang === "zh" ? "zh-Hans" : lang)}`, 8000);
      await sleep(400);
      assert(await page.evaluate("typeof window.LQFortuneCrisis === 'undefined'"), path + ": fortune-crisis.js was not blocked");
      return page;
    };
    // RE-LOCK merge-2 2026-11-17 (test fault of relock-merge, run v3-2-affected-3.log): tarot / iching only shuffle / cast on the
    // question (no reading yet) and numbers refuses a non-Thai name, so no reading is drawn and there is no closing line to look
    // for. Now: when a reading section is shown, its closing line must hold a visible tel:1323 of >= 44 px; in every case a visible
    // tel:1323 of >= 44 px is on the page (the closing line or the top bar's 1323 control).
    const tel = label => `(() => { ${VIS} const secs = [...document.querySelectorAll(".fa-section")].filter(vis).length;
      const close = [...document.querySelectorAll('.lq-helpline a[href="tel:1323"]')].filter(x => !x.closest("#lqHelpTop")).find(vis);
      if (secs && !close) return ${S(label)} + ": a reading is shown without the closing-line tel:1323";
      const a = close || [...document.querySelectorAll('a[href="tel:1323"]')].find(vis); if (!a) return ${S(label)} + ": no visible tel:1323 link";
      const b = a.getBoundingClientRect(); return b.height >= 44 ? "" : ${S(label)} + ": tel:1323 is " + Math.round(b.height) + " px tall (< 44)"; })()`;
    const E5 = [
      // re-lock 2026-11-17 (append-only): the name tab is opened BEFORE the baseline, as in part A (v1 opened it after the
      // baseline, so the tab's own label "ชื่อจริง" counted as an echo of "อยากตายจริงๆ"); assertion unchanged
      ["numbers name", "numbers.html", NM, async (p, q) => { await p.evaluate(setVal("#nmName", q)); try { await p.evaluate(submit("nmForm")); } catch (e) { /* replaced */ } },
        p => p.evaluate(click('.nm-tab[data-tab="name"]'))],
      ["tarot question", "tarot.html", TR, async (p, q) => { await p.evaluate(setVal("#trQuestion", q)); await p.evaluate(submit("trSetup")); }],
      ["iching question", "iching.html", IC, async (p, q) => { await p.evaluate(setVal("#icQuestion", q)); await p.evaluate(click("#icStart")); }],
    ];
    for (const [name, path, widgets, act, prep] of E5) {
      await each(check, `E5 ${name}, fortune-crisis.js blocked: crisis phrase -> crisis state, no card, the closing line with a 44 px tel:1323 (v3)`, async ({ lang, width, phrase, label }) => {
        const page = await openBlocked(path, { width, lang });
        try {
          if (prep) { await prep(page); await sleep(300); }
          const before = await baseline(page);
          await act(page, phrase);
          await assertCard(page, { label, typed: phrase, before, widgets });
          const t = await page.evaluate(tel(label));
          assert(!t, t);
        } finally { await page.close(); }
      });
    }
  } finally {
    await browser.close();
  }
}

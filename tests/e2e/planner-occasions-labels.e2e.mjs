// tests/e2e/planner-occasions-labels.e2e.mjs — FIXED TEST SET "planner-occasions-labels" (owner decisions 114–117, 2026-11-19),
// locked BEFORE the build (evals-locks/planner-occasions-labels.sha256, ~/LENSIQ-field/evals/planner-occasions-labels/).
// The static half: tests/unit/planner-occasions-labels.test.js. planner.html at 360 px (phone, touch), TH / EN / ZH:
//   V1  a modern occasion (compreg, launch, regmarry): the plain-reason box (#plWhy) shows the label (.pl-modern) with the exact
//       wording of the page language, visible and whole inside the 360 px screen (not clipped, not hidden, font >= 12 px); every
//       reason line of an occasion-specific rule carries the label, reason lines of the owner's birth weekday (taksa) / zodiac
//       do not
//   V2  a text occasion with modern rules (move: waxing, even month; shop, work: waxing): #plWhy shows the label; every reason line
//       of a modern rule (data-r waxing / full / evenMonth) carries the label, visible at 360 px; no other reason line does
//   V3  a text occasion without modern rules (wedding, which also uses the waxing moon, from its own text): no label anywhere
//   V4  no horizontal scroll; in EN / ZH no Thai in any label; no console errors
import { assert } from "./cdp.mjs";

const S = JSON.stringify;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LANGS = ["th", "en", "zh"];
const LABEL = { th: "ตามความนิยมสมัยใหม่", en: "Modern practice", zh: "现代习俗" };
const THAI = /[ก-ฺเ-๛]/;
const unexpected = page => page.consoleErrors.filter(e => !/favicon/.test((e.url || "") + " " + (e.text || "")));
const GROUP = { compreg: "biz", launch: "study", regmarry: "family", move: "home", shop: "biz", work: "study", wedding: "family" };
// owner 1: born Thursday, year of the Dragon (gives taksa and zodiac reason lines next to the occasion's own)
const OWNER = { wd: "4", zd: "4" };
const SHARED_ID = /^(bh\.|z(Harmony|Trine|Same)$|phra$)/;
const MODERN_IDS = { move: ["waxing", "full", "evenMonth"], shop: ["waxing", "full"], work: ["waxing", "full"] };

const STATE = `(() => {
  const W = document.documentElement.clientWidth;
  const look = el => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    return { t: el.innerText.trim(), l: r.left, r: r.right, w: r.width, h: r.height, fs: parseFloat(cs.fontSize),
      vis: !!el.getClientRects().length && !el.closest("[hidden]") && cs.visibility !== "hidden" && cs.display !== "none" && +cs.opacity > 0.5,
      clip: el.scrollWidth > el.clientWidth + 1 }; };
  const why = document.getElementById("plWhy");
  return { W, sw: document.documentElement.scrollWidth, ev: window.__pl && window.__pl.st.ev,
    whyLabels: [...why.querySelectorAll(".pl-modern")].map(look),
    lis: [...document.querySelectorAll("#plList .pl-why li")].slice(0, 60).map(li => ({ r: li.getAttribute("data-r"), labels: [...li.querySelectorAll(".pl-modern")].map(look) })),
    all: document.querySelectorAll("#plResult .pl-modern").length };
})()`;

function okLabel(where, lb, lang, W) {
  assert(lb.vis, `${where}: label hidden ${S(lb)}`);
  assert(lb.t === LABEL[lang], `${where}: label text ${S(lb.t)} (want ${S(LABEL[lang])})`);
  assert(lb.l >= 0 && lb.r <= W + 0.5 && lb.w > 8 && lb.h > 8, `${where}: label outside the ${W}px screen ${S(lb)}`);
  assert(!lb.clip, `${where}: label clipped ${S(lb)}`);
  assert(lb.fs >= 12, `${where}: label font ${lb.fs}px`);
  if (lang !== "th") assert(!THAI.test(lb.t), `${where}: Thai in the label`);
}

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    for (const lang of LANGS) {
      await check(`planner occasion labels: ${lang} 360 px — modern occasions and modern rules show "${LABEL[lang]}", tradition ones do not`, async () => {
        const page = await browser.newPage(null, { initScripts: [`try { localStorage.setItem("lq-lang", ${S(lang)}); } catch (e) {}`] });
        await page.goto(`${base}/planner.html`);
        await page.waitFor(`!!window.__pl && !!window.LQI18N && LQI18N.lang === ${S(lang)}`, 8000);
        await page.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
        await page.send("Emulation.setDeviceMetricsOverride", { width: 360, height: 800, deviceScaleFactor: 2, mobile: true });
        await sleep(250);
        let first = true;
        for (const ev of ["compreg", "launch", "regmarry", "move", "shop", "work", "wedding"]) {
          const where = `${lang} 360px ${ev}`;
          await page.evaluate(`(() => {
            if (!${first}) document.getElementById("plAgain").click();
            const g = document.querySelector('input[name=plGroup][value=${S(GROUP[ev])}]');
            if (!g.checked) g.closest("label").click();
            document.querySelector('input[name=plEvent][value=${S(ev)}]').closest("label").click();
            const wd = document.querySelector(".pl-owner .pl-wd"), zd = document.querySelector(".pl-owner .pl-zd");
            wd.value = ${S(OWNER.wd)}; wd.dispatchEvent(new Event("change", { bubbles: true }));
            zd.value = ${S(OWNER.zd)}; zd.dispatchEvent(new Event("change", { bubbles: true }));
            const sp = document.getElementById("plSpan"); sp.value = "3";
            const fr = document.getElementById("plFrom"); const want = [...fr.options].find(o => o.value === "2027-5"); if (want) fr.value = want.value;
            document.getElementById("plGo").click();
          })()`);
          first = false;
          await page.waitFor(`window.__pl.st.ev === ${S(ev)} && !document.getElementById("plResult").hidden && document.querySelectorAll("#plList .pl-day").length > 0`, 8000);
          await sleep(300);
          const s = await page.evaluate(STATE);
          assert(s.sw <= s.W, `${where}: horizontal scroll ${s.sw} > ${s.W}`);
          assert(s.lis.length > 0, `${where}: no reason lines`);
          assert(s.lis.every(x => x.r), `${where}: reason line without data-r`);
          if (["compreg", "launch", "regmarry"].includes(ev)) {
            assert(s.whyLabels.length >= 1, `${where}: no label in the plain reason`);
            for (const lb of s.whyLabels) okLabel(where + " why", lb, lang, s.W);
            let own = 0;
            for (const li of s.lis) {
              if (SHARED_ID.test(li.r)) { assert(!li.labels.length, `${where}: label on a taksa / zodiac line ${li.r}`); continue; }
              own++;
              assert(li.labels.length === 1, `${where}: reason ${li.r} without the label`);
              okLabel(`${where} reason ${li.r}`, li.labels[0], lang, s.W);
            }
            assert(own > 0, `${where}: no occasion-specific reason line`);
          } else if (MODERN_IDS[ev]) {
            assert(s.whyLabels.length >= 1, `${where}: no label in the plain reason`);
            for (const lb of s.whyLabels) okLabel(where + " why", lb, lang, s.W);
            let mod = 0;
            for (const li of s.lis) {
              if (MODERN_IDS[ev].includes(li.r)) { mod++; assert(li.labels.length === 1, `${where}: modern reason ${li.r} without the label`); okLabel(`${where} reason ${li.r}`, li.labels[0], lang, s.W); }
              else assert(!li.labels.length, `${where}: label on a text reason ${li.r}`);
            }
            assert(mod > 0, `${where}: no modern reason line shown (waxing days expected in 3 months)`);
          } else {
            assert(s.all === 0, `${where}: a tradition occasion shows ${s.all} modern labels`);
          }
        }
        const errs = unexpected(page);
        assert(!errs.length, "console errors: " + S(errs.slice(0, 3)));
        await page.close();
      });
    }
  } finally { await browser.close(); }
}

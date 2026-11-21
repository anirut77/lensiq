// tests/e2e/planner-people-wrap.e2e.mjs — FIXED TEST SET "planner defects" part a (owner report 2026-11-18, Samsung Android
// default browser, planner.html: in the "add related people" part, a closing bracket dropped alone onto the next line).
// Locked BEFORE any product fix (evals-locks/planner-defects.sha256, ~/LENSIQ-field/evals/planner-defects/).
// planner.html × TH / EN / ZH × phone widths 360, 375, 393, 412, 430 px. The line boxes are read with the locked line-wrap
// probe (tests/e2e/line-wrap-kit.mjs PROBE, kind P = a line that starts with closing punctuation such as ")" "）" or a line
// that ends with an opening bracket), limited to the planner form (#plForm: owners, "+ add a second owner", birth-day
// helpers, the privacy line and the read button). Kind P findings FAIL; there is no exception list.
// States: (1) at load; (2) after "+ add a second owner" (second owner shown, both "not sure of the weekday?" helpers open);
// (3) after it is pressed again (label back to "+ add ..."); (4) after a run-time language switch to the next language
// (th -> en -> zh -> th), with the second owner shown. In state (1) the widths 300-440 px are also swept in 2 px steps: a
// phone font a little wider or narrower than the test machine's moves the breaks, and the sweep stands in for that.
import { assert } from "./cdp.mjs";
import { PROBE } from "./line-wrap-kit.mjs";

const LANGS = ["th", "en", "zh"];
const WIDTHS = [360, 375, 393, 412, 430];
const NEXT = { th: "en", en: "zh", zh: "th" };
const HTML_LANG = { th: "th", en: "en", zh: "zh-Hans" };
const S = JSON.stringify;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const INIT = "window.alert=()=>{};window.confirm=()=>false;window.prompt=()=>null;";
const ROOT = "document.getElementById('plForm')";
const SCOPED = PROBE.replace("document.createTreeWalker(document.body", `document.createTreeWalker(${ROOT}`)
  .replace('document.body.querySelectorAll("*")', `${ROOT}.querySelectorAll("*")`);
const phone = (page, w) => page.send("Emulation.setDeviceMetricsOverride", { width: w, height: 800, deviceScaleFactor: 2, mobile: true });

export default async function ({ base, launch, check }) {
  await check("the line-wrap probe can be limited to the planner form", async () => {
    assert(SCOPED !== PROBE && !SCOPED.includes("createTreeWalker(document.body") && !SCOPED.includes('document.body.querySelectorAll("*")'),
      "the line-wrap probe changed shape; this test must be re-locked with the new probe");
  });
  const browser = await launch();
  try {
    for (const lang of LANGS) {
      await check(`planner.html ${lang}: no lone ")" or other lone punctuation in the owners / add-person part (360-430 px, 4 states)`, async () => {
        const page = await browser.newPage(null, { initScripts: [INIT, `try { localStorage.setItem("lq-lang", ${S(lang)}); } catch (e) {}`] });
        const bad = [];
        const probe = async (state, widths) => {
          let n = 0;
          for (const w of widths) {
            await phone(page, w); await sleep(widths.length > 5 ? 60 : 150);
            for (const f of await page.evaluate(SCOPED)) if (f.kind === "P") { n++; bad.push(`${state} ${w}: ${f.text}`); }
          }
          console.log(`       count planner.html ${lang} ${state}: lone punctuation ${n}`);
        };
        try {
          await phone(page, 393);
          await page.goto(`${base}/planner.html?nosw`);
          await page.waitFor(`document.readyState === "complete" && document.documentElement.lang === ${S(HTML_LANG[lang])}`, 10000);
          await page.evaluate("document.fonts ? document.fonts.ready.then(() => 1) : 1");
          await sleep(900);
          const label = await page.evaluate("document.getElementById('plAddOwner').textContent.replace(/\\s+/g, ' ').trim()");
          assert(/[)）]$/.test(label), `${lang}: the add-person button label should end with a closing bracket: ${label}`);
          await probe("load", WIDTHS);
          const sweep = []; for (let w = 300; w <= 440; w += 2) sweep.push(w);
          await probe("load-sweep", sweep);
          await page.evaluate("document.getElementById('plAddOwner').click(); document.querySelectorAll('#plForm details').forEach(d => { d.open = true; }); 1");
          await page.waitFor("!document.getElementById('plOwner2').hidden", 3000); await sleep(400);
          await probe("second-owner", WIDTHS);
          await page.evaluate("document.getElementById('plAddOwner').click(); 1");
          await page.waitFor("document.getElementById('plOwner2').hidden", 3000); await sleep(900);
          await probe("toggled-back", WIDTHS);
          await page.evaluate("document.getElementById('plAddOwner').click(); 1");
          await page.waitFor("!document.getElementById('plOwner2').hidden", 3000);
          await page.evaluate(`window.LQI18N.setLang(${S(NEXT[lang])}); 1`);
          await page.waitFor(`document.documentElement.lang === ${S(HTML_LANG[NEXT[lang]])}`, 10000); await sleep(1200);
          await probe("switched-to-" + NEXT[lang], WIDTHS);
        } finally { await page.close(); }
        const uniq = [...new Set(bad)];
        assert(!uniq.length, `${uniq.length} lone punctuation line(s):\n         ` + uniq.slice(0, 30).join("\n         "));
      });
    }
  } finally { await browser.close(); }
}

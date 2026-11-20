// tests/e2e/fortune-caution-wrap.e2e.mjs — FIXED TEST SET fortune-caution (owner item 177, 2026-11-20), T11. Locked BEFORE any
// RELOCK 3 2026-11-20 (independent review of wave 0 + owner rule "month ranges, never a single day"): readings F23 / F26 (lek7, lifegraph;
// both page domains now excluded) replaced by F15 / F22; console-error checks count script exceptions and errors naming a
// fortune-caution file (the page's own 404 of /api/fortune/status on the local test server is not the section's).
// RELOCK relock2 2026-11-20: the section's root class is .lq-caution-sec (was .lq-caution, which the reading already uses for its own caution
// paragraphs, fortune-read.js); only that selector changed, no assertion.
// product code (evals-locks/fortune-caution.sha256). The open section (closed state, disclaimer, content) at phone widths 360,
// 393 and 430 px in TH / EN / ZH: no lone bracket or punctuation, no one-word last line, no number split from its unit, using
// the item-78 line-wrap probe (tests/e2e/line-wrap-kit.mjs PROBE) with no exception. The section is mounted on horoscope.html
// by the test (wave 0 wires no page), with the locked SYNTHETIC readings; the rest of the page is hidden so only the section
// is measured.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assert } from "./cdp.mjs";
import { PROBE } from "./line-wrap-kit.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..", "..");
const FIX = JSON.parse(readFileSync(join(repo, "tests", "unit", "fixtures", "fortune-caution-profiles.json"), "utf8"));
const S = JSON.stringify;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ON = "window.LENSIQ_FORTUNE_CAUTIONS = true; window.LENSIQ_FORTUNE_CAUTIONS_CN_WEST = true; window.LENSIQ_FORTUNE_CAUTIONS_DRAFTS = true;";
const WIDTHS = [360, 393, 430];
const reading = name => FIX.readings.find(r => r.name.startsWith(name + " "));
const inputOf = (r, lang) => ({ domain: r.domain, facts: { domain: r.domain, items: r.items }, period: r.period ? FIX.periods[r.period] : null, lang });
const ISOLATE = `(() => {
  const sec = document.querySelector(".lq-caution-sec");
  for (let e = sec; e && e !== document.body; e = e.parentElement) for (const s of e.parentElement.children) if (s !== e && !s.contains(sec)) s.style.setProperty("display", "none", "important");
  return 1;
})()`;
const phone = (pg, w) => pg.send("Emulation.setDeviceMetricsOverride", { width: w, height: 800, deviceScaleFactor: 2, mobile: true });

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    for (const lang of ["th", "en", "zh"]) {
      await check(`T11 ${lang}: the section at 360 / 393 / 430 px has no lone punctuation, widow or split number`, async () => {
        const pg = await browser.newPage(null, { initScripts: [ON, `try { localStorage.setItem("lq-lang", ${S(lang)}); } catch (e) {}`] });
        try {
          await phone(pg, 393);
          await pg.goto(`${base}/horoscope.html`); await sleep(600);
          await pg.evaluate(() => new Promise((res, rej) => {
            const s = document.createElement("script"); s.src = "fortune-caution.js"; s.onload = () => res(1); s.onerror = rej; document.head.appendChild(s);
          }));
          await pg.evaluate(() => { const h = document.createElement("div"); h.id = "lqCautionHost"; (document.querySelector("main") || document.body).appendChild(h); return 1; });
          const bad = [];
          let states = 0;
          for (const name of ["F1", "F17", "F21", "F15", "F22", "F38"]) {
            const mounted = await pg.evaluate(`!!window.LQFortuneCaution.mount(document.getElementById("lqCautionHost"), ${S(inputOf(reading(name), lang))})`);
            assert(mounted, name + ": mounted");
            await pg.evaluate(ISOLATE);
            const measure = async label => {
              states++;
              for (const w of WIDTHS) {
                await phone(pg, w); await sleep(120);
                for (const f of await pg.evaluate(PROBE)) bad.push(`${name} ${label} ${w} ${f.kind} ${f.text}`);
              }
            };
            await measure("closed");
            await pg.evaluate(`document.querySelector(".lq-caution-open").click()`); await sleep(150);
            if (await pg.evaluate("!!document.querySelector('.lq-caution-accept')")) {
              await measure("disclaimer");
              await pg.evaluate(`document.querySelector(".lq-caution-accept").click()`);
            }
            await pg.waitFor("!!document.querySelector('.lq-caution-body')", 8000);
            await measure("open");
          }
          assert(states >= 13, "states measured: " + states);
          assert(!bad.length, bad.length + " line break problem(s):\n         " + bad.slice(0, 30).join("\n         "));
        } finally { await pg.close(); }
      });
    }
  } finally { await browser.close(); }
}

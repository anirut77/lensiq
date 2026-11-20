// tests/e2e/fortune-caution-reading-visible.e2e.mjs — FIXED TEST SET fortune-caution, relock7 (the reviewer's gap, round 2, 2026-11-20): the
// reading's own caution paragraphs (.fa-section .lq-caution, fortune-read.js; "always shown, never folded") stay visible while the caution section
// is mounted: closed, under its disclaimer, open, closed again, and after the tab's calm flag removes the section (crisis v3: the reading
// continues). Pages: horoscope.html (live preview: switch + drafts on) and bazi.html (+ the Chinese switch, a preview). SYNTHETIC births.
// "Visible": a layout box, checkVisibility() with visibility and opacity, not inside the section.
import { assert } from "./cdp.mjs";

const S = JSON.stringify;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ON = "window.LENSIQ_FORTUNE_CAUTIONS = true; window.LENSIQ_FORTUNE_CAUTIONS_DRAFTS = true;";
const CN = "window.LENSIQ_FORTUNE_CAUTIONS_CN_WEST = true;";
const PAGES = {
  horoscope: { init: [ON], body: "hsRd-body", again: "hsRd-again",
    fill: `(() => { const d = document.getElementById("hsDay"), m = document.getElementById("hsMonth"); d.value = d.options[14].value; m.value = m.options[5].value;
      document.getElementById("hsYear").value = "2533"; document.getElementById("hsForm").requestSubmit(); return 1; })()` },
  bazi: { init: [ON, CN], body: "lcRd-body", again: "lcRd-again",
    fill: `(() => { document.getElementById("lcDay").value = "12"; document.getElementById("lcMonth").value = "5"; document.getElementById("lcYear").value = "2533";
      document.querySelector("#lcForm button[type=submit]").click(); return 1; })()` },
};
const CAUTIONS = `(() => {
  const all = [...document.querySelectorAll(".fa-section .lq-caution")].filter(e => !e.closest(".lq-caution-sec"));
  const vis = e => e.getClientRects().length > 0 && (!e.checkVisibility || e.checkVisibility({ visibilityProperty: true, opacityProperty: true })) && !e.closest("[hidden]");
  return { n: all.length, visible: all.filter(vis).length, sec: !!document.querySelector(".lq-caution-sec") };
})()`;
const click = (pg, sel) => pg.evaluate(`(() => { const e = document.querySelector(${S(sel)}); if (!e) return false; e.click(); return true; })()`);

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    for (const [p, cfg] of Object.entries(PAGES)) {
      await check(`${p}: the reading's own caution paragraphs stay visible with the section closed, open, closed again and after the calm flag`, async () => {
        const pg = await browser.newPage(null, { initScripts: cfg.init, isolated: true });
        try {
          await pg.send("Emulation.setDeviceMetricsOverride", { width: 393, height: 800, deviceScaleFactor: 2, mobile: true });
          await pg.goto(`${base}/${p}.html`); await sleep(500);
          await pg.evaluate(cfg.fill);
          await pg.waitFor(`(() => { const b = document.getElementById(${S(cfg.body)}); return !!b && b.textContent.trim().length > 40; })()`, 15000);
          await pg.waitFor("!!document.querySelector('.lq-caution-sec')", 5000);
          let c = await pg.evaluate(CAUTIONS);
          for (let i = 0; i < 8 && !c.n; i++) { await click(pg, "#" + cfg.again); await sleep(900); c = await pg.evaluate(CAUTIONS); }
          assert(c.n >= 1, p + ": the reading has at least one caution paragraph to check");
          const states = [["closed", c]];
          await click(pg, ".lq-caution-open"); await sleep(200);
          states.push(["disclaimer", await pg.evaluate(CAUTIONS)]);
          if (await pg.evaluate("!!document.querySelector('.lq-caution-accept')")) await click(pg, ".lq-caution-accept");
          await pg.waitFor("!!document.querySelector('.lq-caution-body')", 8000);
          states.push(["open", await pg.evaluate(CAUTIONS)]);
          await click(pg, ".lq-caution-close"); await sleep(200);
          states.push(["closed again", await pg.evaluate(CAUTIONS)]);
          await click(pg, ".lq-caution-open"); await pg.waitFor("!!document.querySelector('.lq-caution-body')", 8000);
          await pg.evaluate("window.LQFortuneCrisis.setCalm(document)"); await sleep(400);
          const calm = await pg.evaluate(CAUTIONS);
          assert(!calm.sec, p + ": the calm flag removes the section");
          states.push(["calm", calm]);
          for (const [name, s] of states) assert(s.n >= 1 && s.visible === s.n, `${p} ${name}: ${s.visible}/${s.n} of the reading's caution paragraphs visible`);
        } finally { await pg.close(); }
      });
    }
  } finally { await browser.close(); }
}

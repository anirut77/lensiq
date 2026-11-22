// tests/e2e/fortune-caution-reading-visible.e2e.mjs — FIXED TEST SET fortune-caution, relock7 (the reviewer's gap, round 2, 2026-11-20): the
// reading's own caution paragraphs (.fa-section .lq-caution, fortune-read.js; "always shown, never folded") stay visible while the caution section
// is mounted: closed, under its disclaimer, open, closed again, and after the tab's calm flag removes the section (crisis v3: the reading
// continues). Pages: horoscope.html (live preview: switch + drafts on) and bazi.html (+ the Chinese switch, a preview). SYNTHETIC births.
// "Visible": a layout box, checkVisibility() with visibility and opacity, not inside the section.
// RE-LOCK 12 2026-11-22 (fortune-caution relock12, test fault, CI 44967695261: main red on Sunday 2026-11-22, "horoscope closed: 2/8"):
// the horoscope page shows its reading in page tabs; after a reading the overview tab is selected, and the "today" tab (#pn-td) holds
// caution paragraphs of its own on some dates only (for this synthetic birth every Sunday and every Rat day). Relock 7 counted those as
// "not visible" although no visitor sees any tab but the one selected, so the check failed on those dates whatever the product did. Now,
// in EVERY state (closed, disclaimer, open, closed again, calm), the cautions outside a closed tab must be visible, and every closed tab
// panel that holds cautions is opened in turn, its cautions must be visible, and the visitor's tab is selected again with the section in
// the same state (the rule of fortune-layout.e2e.mjs re-lock 7). Stricter in two ways: cautions in closed tabs are now checked (they
// were never shown before), and a caution inside a read-more body or a closed <details> fails. Nothing else changed: same pages, births,
// switches, states, real clock. Date span: tests/e2e/fortune-caution-dates.e2e.mjs (datefix-1122). Independent review (2026-11-22,
// before locking): a tab is clicked only when a visitor can see and use it (shown, not [hidden], not display:none, enabled); a caution in a
// tab a visitor cannot open fails; "back on" rows are not base rows; the "again" retry waits for a caution in the open tab.
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
  const closedTab = e => { const tp = e.closest('[role="tabpanel"]'); return tp && (tp.hidden || getComputedStyle(tp).display === "none") ? tp : null; };
  const vis = e => e.getClientRects().length > 0 && (!e.checkVisibility || e.checkVisibility({ visibilityProperty: true, opacityProperty: true })) && !e.closest("[hidden]");
  const folded = e => !!e.closest(".lq-more-body") || (() => { for (let d = e.closest("details"); d; d = d.parentElement && d.parentElement.closest("details")) {
    const sum = d.querySelector(":scope > summary"); if (!d.open && !(sum && sum.contains(e))) return true; } return false; })();
  const open = all.filter(e => !closedTab(e)), panels = [];
  for (const e of all) { const tp = closedTab(e); if (tp && !panels.includes(tp.id)) panels.push(tp.id); }
  return { n: all.length, inOpen: open.length, visible: open.filter(e => vis(e) && !folded(e)).length, panels, sec: !!document.querySelector(".lq-caution-sec"),
    body: !!document.querySelector(".lq-caution-body") };
})()`;
const SELECTED = `(() => { const t = [...document.querySelectorAll('[role="tab"][aria-controls]')].find(x => x.getAttribute("aria-selected") === "true"); return t ? t.getAttribute("aria-controls") : null; })()`;
/** click the tab of panel id only when a visitor can use it: "ok", or why not (no tab, not shown, disabled) */
const openTab = id => `(() => { const t = document.querySelector('[role="tab"][aria-controls=${S(id)}]'); if (!t) return "no tab";
  const r = t.getBoundingClientRect(); let shown = r.width > 0 && r.height > 0 && !t.closest("[hidden]");
  for (let x = t; shown && x && x.nodeType === 1; x = x.parentElement) { const cs = getComputedStyle(x); if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") shown = false; }
  if (!shown) return "tab not visible to a visitor"; if (t.disabled || t.getAttribute("aria-disabled") === "true") return "tab disabled";
  t.click(); return "ok"; })()`;
/** one state: the open tab's cautions, then every closed tab panel that holds cautions opened in turn, then the visitor's tab again */
async function stateCheck(pg, label) {
  const c = await pg.evaluate(CAUTIONS);
  const rows = [[label, c]];
  if (c.panels.length) {
    const back = await pg.evaluate(SELECTED);
    for (const id of c.panels) {
      const why = await pg.evaluate(openTab(id));
      assert(why === "ok", `${label}: cautions in the closed panel #${id} that a visitor cannot open (${why})`);
      await sleep(250);
      const t = await pg.evaluate(CAUTIONS);
      assert(!t.panels.includes(id), `${label}: panel #${id} still closed after its tab was opened`);
      rows.push([`${label}, tab #${id} open`, t]);
    }
    assert(back && await pg.evaluate(openTab(back)) === "ok", `${label}: the visitor's tab #${back} could not be selected again`);
    await sleep(250);
    const again = await pg.evaluate(CAUTIONS);
    assert(again.sec === c.sec && again.body === c.body, `${label}: the caution section changed state while the tabs were switched`);
    rows.push([`${label}, back on #${back}`, again]);
  }
  return rows;
}
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
          for (let i = 0; i < 8 && !c.inOpen; i++) { await click(pg, "#" + cfg.again); await sleep(900); c = await pg.evaluate(CAUTIONS); }
          assert(c.n >= 1 && c.inOpen >= 1, p + ": the reading has at least one caution paragraph in the open tab to check");
          const states = await stateCheck(pg, "closed");
          await click(pg, ".lq-caution-open"); await sleep(200);
          states.push(...await stateCheck(pg, "disclaimer"));
          if (await pg.evaluate("!!document.querySelector('.lq-caution-accept')")) await click(pg, ".lq-caution-accept");
          await pg.waitFor("!!document.querySelector('.lq-caution-body')", 8000);
          states.push(...await stateCheck(pg, "open"));
          await click(pg, ".lq-caution-close"); await sleep(200);
          states.push(...await stateCheck(pg, "closed again"));
          await click(pg, ".lq-caution-open"); await pg.waitFor("!!document.querySelector('.lq-caution-body')", 8000);
          await pg.evaluate("window.LQFortuneCrisis.setCalm(document)"); await sleep(400);
          assert(!(await pg.evaluate("!!document.querySelector('.lq-caution-sec')")), p + ": the calm flag removes the section");
          states.push(...await stateCheck(pg, "calm"));
          // every caution of the page was checked while shown: the open tab's in each row, closed tabs' in their "tab open" rows
          for (const [name, s] of states) assert(s.n >= 1 && s.inOpen >= 1 && s.visible === s.inOpen, `${p} ${name}: ${s.visible}/${s.inOpen} of the shown caution paragraphs visible (${s.n} on the page)`);
          for (const [name, s] of states) if (s.panels.length && !/, (?:tab|back on) #/.test(name)) assert(states.some(([n2]) => n2.startsWith(name + ", tab #")), `${p} ${name}: closed tabs with cautions were not opened`);
          console.log(`    ${p}: ${states.length} checks, cautions on the page ${c.n}, in closed tabs at first: ${c.panels.join(", ") || "none"}`);
        } finally { await pg.close(); }
      });
    }
  } finally { await browser.close(); }
}

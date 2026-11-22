// tests/e2e/fortune-caution-dates.e2e.mjs — FIXED TEST SET "datefix-1122" (locked 2026-11-22 BEFORE any measurement; copy + sha256 in
// ~/LENSIQ-field/evals/datefix-1122/, evals-locks/datefix-1122.sha256). Main went red on 2026-11-22 (CI 44967695261): the horoscope
// reading's "today" tab holds caution paragraphs only on some dates (for the synthetic birth below, a Friday birth in a Horse year: every
// Sunday, the Friday-born กาลกิณี day, and every Rat day, the day-branch clash), so a check made on one day says nothing about the others.
// This set walks a span of dates with the page clock moved (Date replaced before any page script runs; the same synthetic birth) and checks,
// on every date, that every caution paragraph of the reading (.fa-section .lq-caution, outside the closed "สิ่งที่ควรระวัง" section) can
// be seen in every state of that section: closed, under its disclaimer, open, closed again, open, and after the tab's calm flag.
// A caution inside a page tab that is not selected is never passed over: the tab is opened, its cautions must be visible, and the tab the
// visitor had open is selected again (the rule of tests/e2e/fortune-layout.e2e.mjs, re-lock 7 of 2026-11-17). Visible = a layout box,
// checkVisibility() with visibility and opacity, no [hidden] ancestor, not inside a read-more body, not inside a closed <details>.
// Non-vacuous: on horoscope at least 4 dates of the span have cautions in a tab that is not selected, 2026-11-22 among them.
// Pages: horoscope.html (switch + drafts on) on every date of 2026-11-15 .. 2026-12-20 (36 days: three day-branch cycles, five weeks),
// bazi.html (+ the Chinese switch) on every third date. Clock 03:00 UTC (the same calendar date in UTC and in Bangkok). SYNTHETIC births.
// RE-LOCK 1 2026-11-22 (datefix-1122 relock1, STRICTER, independent review): a closed tab is opened only when a visitor can see and use
// its tab button (shown, not [hidden], not display:none, enabled); a caution in a tab a visitor cannot open fails.
import { assert } from "./cdp.mjs";

const S = JSON.stringify;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ON = "window.LENSIQ_FORTUNE_CAUTIONS = true; window.LENSIQ_FORTUNE_CAUTIONS_DRAFTS = true;";
const CN = "window.LENSIQ_FORTUNE_CAUTIONS_CN_WEST = true;";
const CLOCK = iso => `(() => { const R = Date, off = ${Date.parse(iso)} - R.now();
  class D extends R { constructor(...a) { if (a.length) super(...a); else super(R.now() + off); } static now() { return R.now() + off; } }
  window.Date = D; })();`;
const FIRST = Date.parse("2026-11-15T03:00:00Z"), DAYS = 36;
const DATES = Array.from({ length: DAYS }, (_, i) => new Date(FIRST + i * 864e5).toISOString());
const PAGES = {
  horoscope: { init: [ON], body: "hsRd-body", every: 1,
    fill: `(() => { const d = document.getElementById("hsDay"), m = document.getElementById("hsMonth"); d.value = d.options[14].value; m.value = m.options[5].value;
      document.getElementById("hsYear").value = "2533"; document.getElementById("hsForm").requestSubmit(); return 1; })()` },
  bazi: { init: [ON, CN], body: "lcRd-body", every: 3,
    fill: `(() => { document.getElementById("lcDay").value = "12"; document.getElementById("lcMonth").value = "5"; document.getElementById("lcYear").value = "2533";
      document.querySelector("#lcForm button[type=submit]").click(); return 1; })()` },
};
/** the reading's cautions: { n, shownBad: [...], panels: ids of closed tab panels that hold cautions, sec, body } */
const CAUTIONS = `(() => {
  const all = [...document.querySelectorAll(".fa-section .lq-caution")].filter(e => !e.closest(".lq-caution-sec"));
  const closedTab = e => { const tp = e.closest('[role="tabpanel"]'); return tp && (tp.hidden || getComputedStyle(tp).display === "none") ? tp : null; };
  const vis = e => e.getClientRects().length > 0 && (!e.checkVisibility || e.checkVisibility({ visibilityProperty: true, opacityProperty: true })) && !e.closest("[hidden]");
  const out = { n: all.length, shown: 0, bad: [], panels: [], sec: !!document.querySelector(".lq-caution-sec"), body: !!document.querySelector(".lq-caution-body") };
  for (const c of all) {
    const tp = closedTab(c);
    if (tp) { if (!out.panels.includes(tp.id)) out.panels.push(tp.id); continue; }
    const why = [];
    if (!vis(c)) why.push("hidden");
    if (c.closest(".lq-more-body")) why.push("inside read more");
    for (let d = c.closest("details"); d; d = d.parentElement && d.parentElement.closest("details")) {
      const sum = d.querySelector(":scope > summary"); if (!d.open && !(sum && sum.contains(c))) why.push("inside a closed <details>");
    }
    if (why.length) { const tq = c.closest('[role="tabpanel"]'); out.bad.push((tq ? "#" + tq.id : "page") + ": " + why.join(", ") + ' "' + c.textContent.trim().slice(0, 40) + '"'); }
    else out.shown++;
  }
  return out;
})()`;
const SELECTED = `(() => { const t = [...document.querySelectorAll('[role="tab"][aria-controls]')].find(x => x.getAttribute("aria-selected") === "true"); return t ? t.getAttribute("aria-controls") : null; })()`;
/** click the tab of panel id only when a visitor can use it: "ok", or why not (no tab, not shown, disabled) */
const openTab = id => `(() => { const t = document.querySelector('[role="tab"][aria-controls=${S(id)}]'); if (!t) return "no tab";
  const r = t.getBoundingClientRect(); let shown = r.width > 0 && r.height > 0 && !t.closest("[hidden]");
  for (let x = t; shown && x && x.nodeType === 1; x = x.parentElement) { const cs = getComputedStyle(x); if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") shown = false; }
  if (!shown) return "tab not visible to a visitor"; if (t.disabled || t.getAttribute("aria-disabled") === "true") return "tab disabled";
  t.click(); return "ok"; })()`;
const click = (pg, sel) => pg.evaluate(`(() => { const e = document.querySelector(${S(sel)}); if (!e) return false; e.click(); return true; })()`);

/** every caution of the page checked while it can be seen (closed tabs opened in turn); returns { n, inClosedTabs } */
async function checkState(pg, label) {
  const c = await pg.evaluate(CAUTIONS);
  assert(!c.bad.length, `${label}: caution paragraph(s) not visible: ${c.bad.join(" | ")}`);
  if (c.panels.length) {
    const back = await pg.evaluate(SELECTED);
    for (const id of c.panels) {
      const why = await pg.evaluate(openTab(id));
      assert(why === "ok", `${label}: cautions in the closed panel #${id} that a visitor cannot open (${why})`);
      await sleep(250);
      const t = await pg.evaluate(CAUTIONS);
      assert(!t.panels.includes(id), `${label}: panel #${id} still closed after its tab was opened`);
      assert(!t.bad.length, `${label}, tab #${id} open: caution paragraph(s) not visible: ${t.bad.join(" | ")}`);
    }
    assert(back && await pg.evaluate(openTab(back)) === "ok", `${label}: the visitor's tab #${back} could not be selected again`);
    await sleep(250);
    const again = await pg.evaluate(CAUTIONS);
    assert(again.sec === c.sec && again.body === c.body, `${label}: the caution section changed state while the tabs were switched`);
    assert(!again.bad.length, `${label}, back on #${back}: ${again.bad.join(" | ")}`);
  }
  // every caution was either shown in the open tab or in a closed panel opened above (none passed over)
  const total = await pg.evaluate(`(() => { const all = [...document.querySelectorAll(".fa-section .lq-caution")].filter(e => !e.closest(".lq-caution-sec")); return all.length; })()`);
  assert(total === c.n, `${label}: the number of caution paragraphs changed while checking (${c.n} -> ${total})`);
  return { n: c.n, inClosedTabs: c.panels };
}

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    for (const [p, cfg] of Object.entries(PAGES)) {
      await check(`${p}: on every date of ${DATES[0].slice(0, 10)} .. ${DATES[DAYS - 1].slice(0, 10)}${cfg.every > 1 ? " (every " + cfg.every + "rd)" : ""}, every caution paragraph of the reading is visible (its tab opened) with the section closed, open, closed again and after the calm flag`, async () => {
        const rows = [], tabbed = [];
        for (let i = 0; i < DAYS; i += cfg.every) {
          const day = DATES[i].slice(0, 10);
          const pg = await browser.newPage(null, { initScripts: [CLOCK(DATES[i])].concat(cfg.init), isolated: true });
          try {
            await pg.send("Emulation.setDeviceMetricsOverride", { width: 393, height: 800, deviceScaleFactor: 2, mobile: true });
            await pg.goto(`${base}/${p}.html`); await sleep(400);
            assert(await pg.evaluate(`new Date().toISOString().slice(0, 10)`) === day, `${p} ${day}: the page clock was not moved`);
            await pg.evaluate(cfg.fill);
            await pg.waitFor(`(() => { const b = document.getElementById(${S(cfg.body)}); return !!b && b.textContent.trim().length > 40; })()`, 15000);
            await pg.waitFor("!!document.querySelector('.lq-caution-sec')", 5000);
            await sleep(300);
            const first = await checkState(pg, `${p} ${day} closed`);
            assert(first.n >= 1, `${p} ${day}: the reading has at least one caution paragraph to check`);
            if (first.inClosedTabs.length) tabbed.push(day);
            await click(pg, ".lq-caution-open"); await sleep(200);
            await checkState(pg, `${p} ${day} disclaimer`);
            if (await pg.evaluate("!!document.querySelector('.lq-caution-accept')")) await click(pg, ".lq-caution-accept");
            await pg.waitFor("!!document.querySelector('.lq-caution-body')", 8000);
            await checkState(pg, `${p} ${day} open`);
            await click(pg, ".lq-caution-close"); await sleep(200);
            await checkState(pg, `${p} ${day} closed again`);
            await click(pg, ".lq-caution-open"); await pg.waitFor("!!document.querySelector('.lq-caution-body')", 8000);
            await checkState(pg, `${p} ${day} open again`);
            await pg.evaluate("window.LQFortuneCrisis.setCalm(document)"); await sleep(400);
            assert(!(await pg.evaluate("!!document.querySelector('.lq-caution-sec')")), `${p} ${day}: the calm flag removes the section`);
            const calm = await checkState(pg, `${p} ${day} calm`);
            rows.push(`${day}:${first.n}${first.inClosedTabs.length ? "(" + first.inClosedTabs.join("+") + ")" : ""}/${calm.n}`);
          } finally { await pg.close(); }
        }
        console.log(`    ${p}: ${rows.length} dates checked, cautions per date (closed tabs) / after calm: ${rows.join(" ")}`);
        console.log(`    ${p}: dates with cautions in a tab that is not selected: ${tabbed.length ? tabbed.join(", ") : "none"}`);
        if (p === "horoscope") {
          assert(tabbed.length >= 4, `horoscope: the span must hold at least 4 dates with cautions in a closed tab (non-vacuous), got ${tabbed.length}`);
          assert(tabbed.includes("2026-11-22"), "horoscope: 2026-11-22 (the date main went red) must have cautions in a closed tab");
        }
      });
    }
  } finally { await browser.close(); }
}
